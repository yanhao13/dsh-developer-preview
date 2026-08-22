/**
 * src/lifecycle.ts
 *
 * The inertial fiber lifecycle state machine.
 *
 * This module is the executable counterpart of Section 4 of the paper:
 *
 * - Definition 44  (fiber structure, partly implemented in `fiber.ts`)
 * - Definition 46  (target view)
 * - Definition 47  (registration primitive, realized by `Lifecycle.use`)
 * - Definition 49  (lifecycle states with in-flight transitions)
 * - Definition 50  (guarded withdrawal, realized by `Lifecycle.unload`)
 * - Algorithm 1    (effect iteration, via `EffectEngine`)
 * - Algorithm 4    (component instantiation via `ctx.use`)
 * - Algorithm 5    (component lifecycle: `refresh`, `reload`, `unload`)
 *
 * The lifecycle is deliberately inertial: once a transition is scheduled, a
 * new target change is recorded immediately, but the next transition is only
 * started after the in-flight transition reaches its next boundary.
 */

import type { Context as RuntimeContext } from './context';
import { EffectEngine } from './effect';
import { __registerFiber, __unregisterFiber, notify as coeffectNotify } from './coeffect';
import { Fiber } from './fiber';

import type {
  Component,
  Dispose,
  EffectCallback,
  EffectIterator,
  Fiber as FiberInterface,
  Inverse,
  Key,
} from './types';

/* ------------------------------------------------------------------ *
 * Module-level bookkeeping.
 *
 * The fiber registry is keyed by the root context of each context tree, so
 * independent applications (and independent tests) never observe each
 * other's fibers.  It is used by `computeTarget` to find ACTIVE providers.
 * `runtimeProvided` records keys that were actually observed in the store
 * after a component's activation, complementing the declared `provide` set.
 * ------------------------------------------------------------------ */

const fibersByRoot = new WeakMap<RuntimeContext, Set<Fiber>>();

const runtimeProvided = new WeakMap<Fiber, Set<Key>>();

/* ------------------------------------------------------------------ *
 * Small internal helpers.
 * ------------------------------------------------------------------ */

/** Returns the root of a context tree. */
function rootContext(ctx: RuntimeContext): RuntimeContext {
  let current: RuntimeContext = ctx;
  while (current.parent) {
    current = current.parent;
  }
  return current;
}

/** Returns (creating if necessary) the fiber set of the tree rooted at `ctx`. */
function fibersFor(ctx: RuntimeContext): Set<Fiber> {
  const root = rootContext(ctx);
  let fibers = fibersByRoot.get(root);
  if (!fibers) {
    fibers = new Set<Fiber>();
    fibersByRoot.set(root, fibers);
  }
  return fibers;
}

/** Structural comparison of two target/committed views. */
function targetsEqual(
  a: Map<Key, number> | null,
  b: Map<Key, number> | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, uid] of a) {
    if (b.get(key) !== uid) {
      return false;
    }
  }
  return true;
}

/** True when `value` is an iterator-like object (async or sync). */
function isIteratorLike(value: unknown): value is EffectIterator {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { next?: unknown }).next === 'function'
  );
}

/**
 * Runs inverses in reverse order of their yielding, that is, last-in-first-out.
 * Used to roll back partial activations when an effect iterator raises.
 */
async function runInversesReversed(inverses: readonly Dispose[]): Promise<void> {
  for (let index = inverses.length - 1; index >= 0; index -= 1) {
    await inverses[index]();
  }
}

/**
 * Casts a structural `Context` (the public interface) into the internal
 * `RuntimeContext` type so lifecycle code can reach the symbol-keyed slots.
 */
function asRuntimeContext(ctx: unknown): RuntimeContext {
  return ctx as RuntimeContext;
}

/**
 * The lifecycle engine.
 *
 * All methods are static; no lifecycle instance is ever constructed.
 */
export class Lifecycle {
  /* ---------------------------------------------------------------- *
   * Context-level effect primitive
   * ---------------------------------------------------------------- */

  /**
   * Thin wrapper over `EffectEngine.effect`.
   *
   * `Context.effect` delegates here so that all context mutations share one
   * entry point.
   */
  static effect(ctx: RuntimeContext, callback: EffectCallback): Dispose {
    return EffectEngine.effect(ctx, callback);
  }

  /* ---------------------------------------------------------------- *
   * Component instantiation
   * ---------------------------------------------------------------- */

  /**
   * Instantiates a component as a fiber under `ctx`.
   *
   * Corresponds to Algorithm 4 and the registration primitive of
   * Definition 47.  The fiber's existence is itself a tracked effect on the
   * parent context: when the parent is unloaded, the fiber is retired and
   * deactivated.
   */
  static use(ctx: RuntimeContext, component: Component, config?: any): Fiber {
    let fiber!: Fiber;

    fiber = new Fiber(
      ctx,
      component.inject ?? [],
      component.provide ?? [],
      () =>
        component.apply(
          fiber.ctx,
          config,
        ) as unknown as EffectIterator | (() => Inverse | void),
    );

    fibersFor(ctx).add(fiber);
    __registerFiber(ctx, fiber);

    // The registration callback is itself an effect on the parent context.
    // Its inverse retires the fiber and waits for the fiber to quiesce.
    const callback = (): Inverse => {
      // Begin the fiber's lifecycle immediately.
      Lifecycle.refresh(fiber);

      return async () => {
        fiber.markRetired();

        // If the fiber had already failed, no transition is in flight; run
        // the terminal unload path directly to clean up the registry.
        if (fiber.state === 'FAILED') {
          await Lifecycle.unload(fiber);
          return;
        }

        // In all other cases `markRetired()` has scheduled (or is about to
        // schedule) the necessary transition.  Wait until the fiber reaches
        // INACTIVE / FAILED so that parent teardown sees a quiescent child.
        await fiber.awaitQuiescence();
      };
    };

    // The registration callback returns a bare `Dispose` (the O-Retire
    // inverse).  `EffectCallback` also accepts the plain inverse form, so a
    // cast keeps the union type unambiguous.
    ctx.effect(callback as unknown as EffectCallback);

    return fiber;
  }

  /* ---------------------------------------------------------------- *
   * Target computation and reactive refresh
   * ---------------------------------------------------------------- */

  /**
   * Recomputes a fiber's target view and, when the target changed, starts the
   * correct lifecycle transition.
   *
   * This is the reactive heart of the system.  It realizes Definition 46 and
   * the L-Begin / L-Leave decisions of Algorithm 5.
   */
  static refresh(fiber: Fiber): void {
    const newTarget = Lifecycle.computeTarget(fiber);

    if (targetsEqual(newTarget, fiber.target)) {
      return;
    }

    fiber.target = newTarget;

    // Failed fibers are absorbing: no transition ever restarts them.
    if (fiber.state === 'FAILED') {
      return;
    }

    // Inertial transitions: if a transition is already in flight, only record
    // the new target.  The in-flight transition observes the change at its
    // next boundary and chains accordingly.
    if (fiber.inertia !== null) {
      return;
    }

    if (fiber.state === 'ACTIVE') {
      // An installed fiber always leaves through UNLOADING before it can be
      // reloaded, regardless of whether the new target is `null` or a
      // different provider view.
      fiber.state = 'UNLOADING';
      fiber.inertia = Lifecycle.createTask(() => Lifecycle.unload(fiber));
      return;
    }

    if (fiber.state === 'INACTIVE' && newTarget !== null) {
      fiber.state = 'LOADING';
      fiber.inertia = Lifecycle.createTask(() => Lifecycle.reload(fiber));
      return;
    }

    // LOADING and UNLOADING states keep their in-flight transitions; the
    // target change is handled by the transition itself.
  }

  /**
   * Computes `target(γ, n)` for a fiber (Definition 46).
   *
   * Returns `null` when the fiber is retired, failed, or one of its declared
   * dependencies lacks an ACTIVE provider; otherwise returns a map from each
   * declared key to the UID of the active provider fiber.
   */
  static computeTarget(fiber: Fiber): Map<Key, number> | null {
    if (fiber.retired || fiber.state === 'FAILED') {
      return null;
    }

    const target = new Map<Key, number>();

    for (const key of fiber.inject) {
      const provider = Lifecycle.findProvider(fiber, key);
      if (provider === null) {
        return null;
      }
      target.set(key, provider.uid);
    }

    return target;
  }

  /**
   * Resolves each declared key of `fiber` to the UID of its current provider.
   *
   * This is the committed view used by `reload` (the `ω` of Definition 44).
   * It must only be called when `fiber.target` is non-null.
   */
  static resolveView(fiber: Fiber): Map<Key, number> {
    const view = new Map<Key, number>();

    for (const key of fiber.inject) {
      const provider = Lifecycle.findProvider(fiber, key);
      if (provider === null) {
        throw new Error(
          `Lifecycle.resolveView: dependency '${String(key)}' of fiber ${fiber.uid} ` +
            'is not provided while computing a non-null target view.',
        );
      }
      view.set(key, provider.uid);
    }

    return view;
  }

  /* ---------------------------------------------------------------- *
   * Provider lookup and provided keys
   * ---------------------------------------------------------------- */

  /**
   * Finds the unique ACTIVE fiber that provides `key` to `fiber`, or `null`.
   *
   * The provider must satisfy all of the following:
   *
   * 1. it is not the requesting fiber itself;
   * 2. it is in the ACTIVE lifecycle state;
   * 3. it declares or has actually installed `key`;
   * 4. its resolved realm for `key` equals the requesting fiber's resolved
   *    realm for `key`;
   * 5. the shared coeffect store currently contains a binding for that realm.
   *
   * Under the single-source discipline of Section 4.2 at most one provider can
   * match; if more than one matches, the registry is malformed.
   */
  private static findProvider(fiber: Fiber, key: Key): Fiber | null {
    const ctx = asRuntimeContext(fiber.ctx);
    const realm = ctx._isolateMap().get(key) ?? key;

    if (!ctx._storeMap().has(realm)) {
      return null;
    }

    let found: Fiber | null = null;

    for (const candidate of fibersFor(fiber.parentCtx)) {
      if (candidate === fiber) {
        continue;
      }
      if (candidate.state !== 'ACTIVE') {
        continue;
      }

      if (!Lifecycle.providedKeys(candidate).includes(key)) {
        continue;
      }

      const candidateCtx = asRuntimeContext(candidate.ctx);
      const candidateRealm = candidateCtx._isolateMap().get(key) ?? key;

      if (candidateRealm !== realm) {
        continue;
      }

      if (found !== null) {
        throw new Error(
          `Lifecycle.findProvider: key '${String(key)}' is provided by both ` +
            `fiber ${found.uid} and fiber ${candidate.uid} in the same realm.`,
        );
      }

      found = candidate;
    }

    return found;
  }

  /**
   * Returns the keys for which `fiber` can be considered a provider.
   *
   * The result is the union of:
   *
   * - the component's declared provision set `p` (Definition 43);
   * - keys actually observed in the coeffect store after activation.
   *
   * The runtime-observed set is populated by `syncRuntimeProvided` after a
   * successful reload and cleared on unload.
   */
  static providedKeys(fiber: Fiber): Key[] {
    const keys = new Set<Key>();

    for (const key of fiber.provide) {
      keys.add(key);
    }

    const observed = runtimeProvided.get(fiber);
    if (observed) {
      for (const key of observed) {
        keys.add(key);
      }
    }

    return Array.from(keys);
  }

  /**
   * Scans the coeffect store for bindings installed by `fiber` and records
   * those keys as runtime-provided.  Only declared provision keys are
   * considered, following the invariant `dom(σ_n) ⊆ p_n`.
   */
  private static syncRuntimeProvided(fiber: Fiber): void {
    const ctx = asRuntimeContext(fiber.ctx);
    const store = ctx._storeMap();
    const isolate = ctx._isolateMap();
    const observed = new Set<Key>();

    for (const key of fiber.provide) {
      const realm = isolate.get(key) ?? key;
      if (store.has(realm)) {
        observed.add(key);
      }
    }

    if (observed.size > 0) {
      runtimeProvided.set(fiber, observed);
    }
  }

  /* ---------------------------------------------------------------- *
   * Activation
   * ---------------------------------------------------------------- */

  /**
   * Executes a fiber's activation transition.
   *
   * Corresponds to the L-Begin / L-Iter / L-Finish rules and the divert path
   * of Algorithm 5.  The committed view is fixed before any effect executes;
   * the guard tests its stability at every iteration boundary.
   */
  static async reload(fiber: Fiber): Promise<void> {
    if (fiber.target === null) {
      fiber.inertia = null;
      return;
    }

    const target0 = fiber.target;
    fiber.committed = Lifecycle.resolveView(fiber);

    // Track yielded inverses locally so that, if the effect iterator raises
    // part-way, we can still roll back the partial activation (L-Raise).
    const yieldedInverses: Dispose[] = [];

    const guarded: EffectCallback = async function* () {
      const result = fiber.apply();

      if (isIteratorLike(result)) {
        for await (const inverse of result) {
          if (typeof inverse === 'function') {
            yieldedInverses.push(inverse);
            yield inverse;
          }
        }
        return;
      }

      // Plain effect function: `component.apply` has already performed its
      // forward effect and returned a single inverse.
      if (typeof result === 'function') {
        const inverse = result as Dispose;
        yieldedInverses.push(inverse);
        yield inverse;
      }
    };

    let recover: Dispose;

    try {
      recover = await EffectEngine.execute(guarded, () => fiber.target === target0);
    } catch (error) {
      // Roll back whatever inverses were yielded before the failure.
      await runInversesReversed(yieldedInverses);
      runtimeProvided.delete(fiber);
      Lifecycle.markFailed(fiber, error);
      return;
    }

    // Compose the new inverses into the fiber's accumulator in LIFO order.
    fiber.dispose = EffectEngine.compose(recover, fiber.dispose);

    if (fiber.target === target0) {
      // The resolution stayed stable: the activation commits.
      Lifecycle.syncRuntimeProvided(fiber);
      fiber.state = 'ACTIVE';
      coeffectNotify(fiber.ctx, Lifecycle.providedKeys(fiber));
      fiber.inertia = null;
      return;
    }

    // The target view changed while iterating.  The partial activation must
    // be rolled back before the fiber can react to the new target.
    fiber.state = 'UNLOADING';
    fiber.inertia = Lifecycle.createTask(() => Lifecycle.unload(fiber));
  }

  /* ---------------------------------------------------------------- *
   * Deactivation
   * ---------------------------------------------------------------- */

  /**
   * Executes a fiber's deactivation transition.
   *
   * Implements the guarded withdrawal of Section 4.3.1:
   *
   * 1. mark the fiber UNLOADING (L-Leave), so it stops providing new keys;
   * 2. notify dependents and wait for each of them to reach INACTIVE /
   *    FAILED before running the accumulator;
   * 3. run the accumulated inverse (L-Unload);
   * 4. either settle as INACTIVE or chain directly into a new reload.
   */
  static async unload(fiber: Fiber): Promise<void> {
    // A failed fiber is already terminal; but the registry still needs to be
    // cleaned when the fiber is permanently retired.
    if (fiber.state === 'FAILED') {
      fiber.inertia = null;
      fiber._settle();
      if (fiber.retired) {
        Lifecycle.removeFiber(fiber);
      }
      return;
    }

    // L-Leave: the fiber stops providing before any inverse runs, so that
    // dependents recompute their targets against the new availability.
    fiber.state = 'UNLOADING';

    const dependents = coeffectNotify(fiber.ctx, Lifecycle.providedKeys(fiber));

    // Guard on L-Unload: do not withdraw while any committed dependent is
    // still installed.  A dependent that must reload after this provider
    // disappears passes through INACTIVE before its next activation.
    await Promise.all(
      dependents.map((dependent) => dependent.awaitQuiescence()),
    );

    let disposeError: unknown = undefined;

    try {
      await fiber.dispose();
    } catch (error) {
      disposeError = error;
    }

    // The accumulator has run; reset the fiber to a clean pre-activation
    // state.  The committed view is kept until *after* disposal so that
    // teardown code can still read the dependencies it was activated with.
    fiber.dispose = EffectEngine.identity();
    fiber.committed = null;
    runtimeProvided.delete(fiber);

    // Expose an INACTIVE quiescence point even when the next transition
    // immediately chains into a reload.  This is what lets a guarding
    // provider observe that the dependent has truly withdrawn.
    fiber.state = 'INACTIVE';
    fiber._settle();
    fiber.inertia = null;

    if (disposeError !== undefined) {
      fiber.state = 'FAILED';
      fiber.target = null;
      fiber.error = disposeError;
      fiber._settle();
      if (fiber.retired) {
        Lifecycle.removeFiber(fiber);
      }
      return;
    }

    if (fiber.retired) {
      Lifecycle.removeFiber(fiber);
      return;
    }

    // The target may have changed while this fiber was unloaded.  If so,
    // chain directly into a fresh activation; otherwise remain INACTIVE.
    if (fiber.target !== null) {
      fiber.state = 'LOADING';
      fiber.inertia = Lifecycle.createTask(() => Lifecycle.reload(fiber));
    }
  }

  /* ---------------------------------------------------------------- *
   * Failure handling
   * ---------------------------------------------------------------- */

  /**
   * Transitions a fiber into the FAILED state (L-Raise reaching
   * `Inactive(ξ)`).
   *
   * A failed fiber:
   *
   * - carries the error in `fiber.error`;
   * - is considered terminal by `computeTarget` (target forced to `null`);
   * - is never automatically restarted by later notifications.
   */
  private static markFailed(fiber: Fiber, error: unknown): void {
    fiber.state = 'FAILED';
    fiber.target = null;
    fiber.committed = null;
    fiber.dispose = EffectEngine.identity();
    fiber.error = error;
    fiber.inertia = null;
    fiber._settle();

    if (fiber.retired) {
      Lifecycle.removeFiber(fiber);
    }
  }

  /* ---------------------------------------------------------------- *
   * Registry maintenance and scheduling
   * ---------------------------------------------------------------- */

  /**
   * Removes a permanently retired fiber from both the lifecycle registry and
   * the coeffect notification registry.
   */
  private static removeFiber(fiber: Fiber): void {
    fibersFor(fiber.parentCtx).delete(fiber);
    __unregisterFiber(fiber.parentCtx, fiber);
  }

  /**
   * Schedules an asynchronous task.
   *
   * The task is queued as a microtask.  Because the returned promise is
   * assigned to `fiber.inertia` before the microtask runs, no reentrant
   * `refresh` can observe the transition as missing.
   */
  private static createTask<T>(task: () => Promise<T>): Promise<T> {
    return Promise.resolve().then(task);
  }
}
