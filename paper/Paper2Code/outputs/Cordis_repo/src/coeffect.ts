/**
 * src/coeffect.ts
 *
 * Reactive coeffect operations.
 *
 * This file realizes the coeffect context `Σ`, its isolated variant `Σiso`,
 * and its intercepted variant `Σinter` as operations on the first-class
 * `Context` object.  It is the direct runtime counterpart of:
 *
 * - Definition 23  (`get` / `set`)
 * - Definition 31  (`intercept`)
 * - Definition 26  (reactive classification; realized through `notify`)
 * - Algorithm 2    (coeffect operations)
 * - Algorithm 3    (reactive notification)
 *
 * Configuration:
 * - `core.coeffect.notificationTrigger: set-and-remove`
 * - `core.coeffect.isolationRealms: true`
 * - `core.coeffect.interceptionMetadataMerge: right-biased`
 *
 * `set()` is implemented as a revertible effect through `ctx.effect`, so the
 * returned disposer removes the binding and `notify()` is invoked both on
 * installation and on removal.
 *
 * The module maintains an internal, per-root-context fiber registry so that
 * `notify()` can re-evaluate every live fiber.  `Lifecycle.use()` is expected
 * to call `__registerFiber()` when a fiber is created and `__unregisterFiber()`
 * when a fiber is permanently removed.
 */

import { Lifecycle } from './lifecycle';

import type { Context } from './context';
import type { Dispose, Fiber, Key, Metadata, Realm } from './types';

/**
 * Per-root-context registry of every live fiber.
 *
 * Contexts form a tree; all derived contexts of one root share the same
 * coeffect store, so the registry is keyed by the root context.
 */
const registryByRoot = new WeakMap<Context, Set<Fiber>>();

/**
 * Returns the root of a context tree.
 */
function rootContext(ctx: Context): Context {
  let current: Context = ctx;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

/**
 * Returns (creating if necessary) the set of fibers registered under the
 * root context of `ctx`.
 */
function fibersFor(ctx: Context): Set<Fiber> {
  const root = rootContext(ctx);
  let fibers = registryByRoot.get(root);
  if (!fibers) {
    fibers = new Set<Fiber>();
    registryByRoot.set(root, fibers);
  }
  return fibers;
}

/**
 * @internal
 *
 * Registers a fiber under the root context tree.  Called by the lifecycle
 * when a fiber is instantiated via `ctx.use()`.
 */
export function __registerFiber(ctx: Context, fiber: Fiber): void {
  fibersFor(ctx).add(fiber);
}

/**
 * @internal
 *
 * Removes a fiber from the root-context registry.  Called by the lifecycle
 * when a fiber is permanently removed (O-Remove).
 */
export function __unregisterFiber(ctx: Context, fiber: Fiber): void {
  const root = rootContext(ctx);
  const fibers = registryByRoot.get(root);
  if (fibers) {
    fibers.delete(fiber);
  }
}

/**
 * Resolves the effective realm for a key in a context.
 *
 * This is the runtime realization of the first layer of `Σiso`: the key is
 * looked up in the context's isolation table `ρ`, and a key with no explicit
 * realm resolves to its own realm (`ρ(k) = k`).
 */
function realmOf(ctx: Context, key: Key): Realm {
  return ctx._isolateMap().get(key) ?? key;
}

/* ------------------------------------------------------------------ *
 * Binding ownership.
 *
 * The store is shared across a context tree, and a replacement provider may
 * overwrite the same realm binding while the previous provider is still
 * being torn down.  An inverse may therefore only delete the binding if it
 * still owns it; otherwise it would erase the replacement's binding.
 * ------------------------------------------------------------------ */

const ownersByRoot = new WeakMap<Context, Map<Realm, Fiber | null>>();

/**
 * Returns (creating if necessary) the realm -> owner-fiber map of the root
 * context tree.  A binding installed outside any fiber (a bare `ctx.set` on
 * the root) records `null` as its owner.
 */
function ownersFor(ctx: Context): Map<Realm, Fiber | null> {
  const root = rootContext(ctx);
  let owners = ownersByRoot.get(root);
  if (!owners) {
    owners = new Map<Realm, Fiber | null>();
    ownersByRoot.set(root, owners);
  }
  return owners;
}

/**
 * Returns the effective interception metadata for a key.
 *
 * Contexts currently materialize their interception map as a copy at
 * derivation time, so a simple map lookup is sufficient after derivation.
 * Custom per-key merge functions can be introduced by extending this helper.
 */
function interceptOf(ctx: Context, key: Key): Metadata {
  return ctx._interceptMap().get(key);
}

/**
 * Merges two interception metadata values.
 *
 * `config.core.coeffect.interceptionMetadataMerge: right-biased`.
 *
 * The default merge follows the right-bias rule of Definition 30: when both
 * values are plain records, the incoming record's fields overwrite the
 * existing record's fields; for any other value type, the incoming value wins.
 */
function mergeMetadata(existing: Metadata, incoming: Metadata): Metadata {
  if (isRecord(existing) && isRecord(incoming)) {
    return { ...existing, ...incoming };
  }
  return incoming;
}

/**
 * True when the value is a non-array, non-null plain object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads a coeffect binding by key.
 *
 * This is `get(k)` from Definition 29.  The key is first resolved through the
 * isolation realm table, and the binding is then read from the shared value
 * store.
 *
 * If the key is not bound, `undefined` is returned.  No lifecycle operation is
 * triggered by reads.
 */
export function get(ctx: Context, key: Key): any {
  const realm = realmOf(ctx, key);
  return ctx._storeMap().get(realm);
}

/**
 * Installs a coeffect binding.
 *
 * This is `set(k, v)` from Definition 23 / Definition 29 and is itself a
 * revertible effect:
 *
 * - the callback writes the value into the shared store;
 * - `notify()` is called immediately after installation;
 * - the inverse deletes the value and calls `notify()` again.
 *
 * The returned disposer is idempotent through `ctx.effect`.
 */
export function set(ctx: Context, key: Key, value: any): Dispose {
  // Capture the realm at installation time.  The context's isolation table
  // may change before the inverse runs, so recomputing the realm later would
  // be unsound.
  const realm = realmOf(ctx, key);

  return ctx.effect(() => {
    ctx._storeMap().set(realm, value);
    ownersFor(ctx).set(realm, ctx.fiber);
    notify(ctx, [key]);

    return () => {
      // Only remove the binding if this fiber (or the bare context) still
      // owns it: a replacement provider may have overwritten the same realm.
      if (ownersFor(ctx).get(realm) === ctx.fiber) {
        ownersFor(ctx).delete(realm);
        ctx._storeMap().delete(realm);
      }
      notify(ctx, [key]);
    };
  });
}

/**
 * Derives a child context with interception metadata merged for `key`.
 *
 * This realizes `intercept(k, ν)` from Definition 31.  The operation is a
 * derived realization: the original context is left untouched, no inverse is
 * tracked, and recovery consists simply of discarding the derived child
 * context.
 *
 * Interception metadata does not alter dependency satisfaction, so no `notify`
 * call is made here.
 */
export function intercept(ctx: Context, key: Key, metadata: Metadata): Context {
  const child = ctx.derive();

  // `child._interceptMap()` initially aliases the parent's table.  Make a
  // private copy so the merge is visible only to the derived context.
  const nextIntercept = new Map(child._interceptMap());
  nextIntercept.set(key, mergeMetadata(nextIntercept.get(key), metadata));

  child._setInterceptMap(nextIntercept);
  return child;
}

/**
 * Re-evaluates every fiber whose declared dependencies are affected by a
 * coeffect change.
 *
 * This is Algorithm 3.  A fiber is affected when:
 *
 * 1. one of the changed keys is present in `fiber.inject`, and
 * 2. the changed context and the fiber's own context resolve that key to the
 *    same isolation realm.
 *
 * The realm comparison is essential when isolation is in play: a change to a
 * binding in one realm must not wake fibers that read the same logical key
 * from a different realm.
 *
 * Each affected fiber is refreshed exactly once.  `refresh` then recomputes
 * the target view and, based on the new target, classifies the change as
 * activating, deactivating, or neutral (Definition 26).
 *
 * @param ctx  the context whose store was mutated
 * @param keys the changed coeffect keys
 * @returns    the fibers that were re-evaluated
 */
export function notify(ctx: Context, keys: Key[]): Fiber[] {
  if (keys.length === 0) {
    return [];
  }

  // Precompute the realm resolution of each changed key at the changed
  // context.  This also de-duplicates repeated keys.
  const changedRealms = new Map<Key, Realm>();
  for (const key of keys) {
    changedRealms.set(key, realmOf(ctx, key));
  }

  const affected: Fiber[] = [];

  // Iterate over a snapshot so that refresh (which may schedule lifecycle
  // transitions) cannot invalidate the iterator.
  for (const fiber of Array.from(fibersFor(ctx))) {
    for (const key of fiber.inject) {
      const changedRealm = changedRealms.get(key);
      if (changedRealm !== undefined && realmOf(fiber.ctx, key) === changedRealm) {
        Lifecycle.refresh(fiber);
        affected.push(fiber);
        break;
      }
    }
  }

  return affected;
}
