/**
 * src/context.ts
 *
 * The first-class context object — the runtime counterpart of the paper’s
 * unified context type `Γ∞ = μΓ. Γ × (Γ → Γ) × Σ`.
 *
 * Every interaction between a component and its environment passes through a
 * `Context`.  The class carries:
 *
 * - the recursive context state (`parent`, `fiber`, and the derived context
 *   tree),
 * - the accumulator `dispose` (`Γ → Γ`),
 * - the coeffect store, isolation realm table and interception table.
 *
 * The three coeffect slots are deliberately private.  All mutation flows
 * through `ctx.effect`, so that every inverse is tracked and composed in LIFO
 * order.  `ctx.isolate()` and `ctx.intercept()` are derived realizations
 * (Definition 27): they do not mutate the shared store and recovery is simply
 * dropping the derived context.
 */

import type {
  Component,
  Dispose,
  EffectCallback,
  Fiber,
  Key,
  Metadata,
  Realm,
  Context as IContext,
} from './types';

import { Lifecycle } from './lifecycle';
import { set as coeffectSet } from './coeffect';

/**
 * Framework-internal symbol keys.
 *
 * These mirror the paper’s `@@name` notation and are exported for use by the
 * loader and for debugging.  The actual storage is the private `Map` fields
 * below; the symbols provide a stable, inspectable name for each slot.
 */
export const STORE_SLOT: unique symbol = Symbol.for('@@store');
export const ISOLATE_SLOT: unique symbol = Symbol.for('@@isolate');
export const INTERCEPT_SLOT: unique symbol = Symbol.for('@@intercept');

/** Identity disposer used as the root accumulator. */
const noop: Dispose = () => {
  /* intentionally empty */
};

/**
 * Right-biased metadata merge used by `ctx.intercept`.
 *
 * The paper leaves the per-key merge semantics open beyond right-bias
 * (Definition 30).  This implementation uses the pragmatic default:
 * plain-object metadata is shallow-merged with the new value winning;
 * any other value simply replaces the old one.
 */
function mergeMetadata(oldMetadata: Metadata, newMetadata: Metadata): Metadata {
  if (isRecord(oldMetadata) && isRecord(newMetadata)) {
    return { ...oldMetadata, ...newMetadata };
  }
  return newMetadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The unified runtime context.
 *
 * A root context is created with `new Context()`.  Every derived context
 * (`derive`, `isolate`, `intercept`, and fiber contexts) shares the root’s
 * coeffect store while optionally overriding the realm/interception tables.
 */
export class Context {
  /** Parent context, or `null` for the root. */
  readonly parent: Context | null;

  /** Whether this context is the root of a context tree. */
  get isRoot(): boolean {
    return this.parent === null;
  }

  /** The fiber owning this context, or `null` for the root. */
  get fiber(): Fiber | null {
    return this._fiber;
  }

  private _fiber: Fiber | null;

  private _store: Map<Realm, any>;
  private _isolate: Map<Key, Realm>;
  private _intercept: Map<Key, Metadata>;

  /**
   * The accumulated inverse of all effects performed directly on this
   * context.  New disposers are prepended, so recovering a context undoes
   * effects in last-in-first-out order.
   */
  dispose: Dispose;

  /**
   * Creates a new context.
   *
   * When a parent is supplied, the child shares the parent’s coeffect slot
   * maps and inherits the parent’s accumulator.  This is the derived
   * realization of Definition 27.
   */
  constructor(parent: Context | null = null) {
    this.parent = parent;
    this._fiber = parent ? parent._fiber : null;
    this.dispose = parent ? parent.dispose : noop;
    this._store = parent ? parent._storeMap() : new Map<Realm, any>();
    this._isolate = parent ? parent._isolateMap() : new Map<Key, Realm>();
    this._intercept = parent
      ? parent._interceptMap()
      : new Map<Key, Metadata>();
  }

  /**
   * Derives a child context that shares the parent’s slot maps and fiber
   * owner.  This is the primitive used by isolation, interception, and fiber
   * context creation.
   */
  derive(): Context {
    return new Context(this as Context);
  }

  /**
   * Tracks a revertible effect.
   *
   * The callback is executed as an effect iterator (`𝔈iter Γ`).  Each yielded
   * value is an inverse; `Lifecycle.effect` composes them into the context’s
   * accumulator and returns an idempotent disposer.
   */
  effect(callback: EffectCallback): Dispose {
    return Lifecycle.effect(this as Context, callback);
  }

  /**
   * Reads a coeffect by key.
   *
   * The key is first resolved through the isolation realm table, then read
   * from the shared value store.  If interception metadata is attached to the
   * key and the stored value is a provider function, the function is applied
   * to the merged metadata.
   */
  get(key: Key): any {
    const realm = this._isolate.get(key) ?? key;
    const stored = this._store.get(realm);
    const metadata = this._intercept.get(key);

    if (metadata !== undefined && typeof stored === 'function') {
      return stored(metadata);
    }

    return stored;
  }

  /**
   * Installs a coeffect binding.
   *
   * This is `set(𝑘, 𝑣)` from Definition 23.  The operation is itself a
   * revertible effect: the returned disposer removes the binding and notifies
   * dependent fibers.
   */
  set(key: Key, value: any): Dispose {
    return coeffectSet(this as Context, key, value);
  }

  /**
   * Derives a child context in which `key` resolves through a different
   * isolation realm.
   *
   * This realizes `isolate(𝑘, 𝑟)` from Definition 29.  No effect is tracked;
   * recovery is implicit by discarding the child context.
   *
   * @param key   dependency key to isolate
   * @param realm realm identifier; a fresh symbol is created by default
   */
  isolate(key: Key, realm?: Realm): Context {
    const child = this.derive();
    const nextIsolate = new Map(child._isolateMap());

    nextIsolate.set(key, realm ?? Symbol());

    child._setIsolateMap(nextIsolate);
    return child;
  }

  /**
   * Derives a child context with interception metadata merged for `key`.
   *
   * This realizes `intercept(𝑘, 𝜈)` from Definition 31.  Interception only
   * affects how a binding is used, not whether it is satisfied, so no reload
   * or notification is triggered.
   */
  intercept(key: Key, metadata: Metadata): Context {
    const child = this.derive();
    const nextIntercept = new Map(child._interceptMap());

    nextIntercept.set(key, mergeMetadata(nextIntercept.get(key), metadata));

    child._setInterceptMap(nextIntercept);
    return child;
  }

  /**
   * Instantiates a component as a fiber under this context.
   *
   * This is the registration primitive of Definition 47.  The fiber’s
   * lifecycle (reload/unload) is managed by `Lifecycle.use`.
   */
  use(component: Component, config?: any): Fiber {
    return Lifecycle.use(this as Context, component, config);
  }

  /* ------------------------------------------------------------------ *
   * Internal accessors used by the core engine.
   *
   * These are intentionally not part of the public `Context` interface.
   * They exist so that `effect.ts`, `coeffect.ts`, `lifecycle.ts` and
   * `loader.ts` can coordinate without reaching into private fields.
   * ------------------------------------------------------------------ */

  /** @internal Returns the shared value store. */
  _storeMap(): Map<Realm, any> {
    return this._store;
  }

  /** @internal Returns the isolation realm table. */
  _isolateMap(): Map<Key, Realm> {
    return this._isolate;
  }

  /** @internal Returns the interception table. */
  _interceptMap(): Map<Key, Metadata> {
    return this._intercept;
  }

  /** @internal Replaces the value store. */
  _setStoreMap(store: Map<Realm, any>): void {
    this._store = store;
  }

  /** @internal Replaces the isolation realm table. */
  _setIsolateMap(isolate: Map<Key, Realm>): void {
    this._isolate = isolate;
  }

  /** @internal Replaces the interception table. */
  _setInterceptMap(intercept: Map<Key, Metadata>): void {
    this._intercept = intercept;
  }

  /** @internal Binds a fiber owner to this context. */
  _setFiber(fiber: Fiber | null): void {
    this._fiber = fiber;
  }
}
