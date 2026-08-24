/**
 * src/fiber.ts
 *
 * The runtime representation of one component instantiation.
 *
 * The `Fiber` class is the executable counterpart of Definition 44
 * (`⟨d, p, e, π, σ, τ, θ⟩`). It deliberately contains *data* and two
 * lifecycle control points only; all transition policy lives in
 * `Lifecycle`:
 *
 * - `uid`           — the fiber name `n : 𝔑`,
 * - `parentCtx`     — the context under which the fiber was instantiated,
 * - `ctx`           — the derived child context (the fiber's own `Γ`),
 * - `inject`        — the declared dependency set `d`,
 * - `provide`       — the declared provision set `p`,
 * - `apply`         — the configured effect function `e`,
 * - `state`         — the coarse lifecycle state `θ`,
 * - `target`        — `target(γ, n)` as a provider-UID map, or `⊥` as `null`,
 * - `committed`     — the committed view `ω` as a provider-UID map,
 * - `dispose`       — the accumulator `g` of installed inverse effects,
 * - `inertia`       — the in-flight transition handle,
 * - `retired`       — the retirement flag `τ`,
 * - `error`         — the per-fiber error outcome `ζ`.
 *
 * The two public methods, `refresh()` and `markRetired()`, are safe actions
 * exposed to orchestrators. `awaitQuiescence()` is the primitive used by the
 * guarded withdrawal of Section 4.3.1: a provider waits for each dependent to
 * reach `INACTIVE` or `FAILED` before running its own accumulator.
 */

import { Lifecycle } from './lifecycle';
import type { Context as RuntimeContext } from './context';
import type {
  Dispose,
  EffectCallback,
  Fiber as IFiber,
  Key,
  LifecycleState,
} from './types';

/** Global monotonic UID source. UIDs are never reused. */
let nextFiberUid = 1;

/**
 * Allocates a fresh, globally unique fiber UID.
 */
function allocateUid(): number {
  const uid = nextFiberUid;
  nextFiberUid += 1;
  return uid;
}

/**
 * A fiber is the runtime instantiation of a component.
 *
 * The constructor is intentionally low-level; `Lifecycle.use` is the factory
 * that coordinates component registration, context derivation and the initial
 * `refresh()` call.
 *
 * @param parentCtx context on which `ctx.use(...)` was invoked
 * @param inject    declared dependency keys (`d`)
 * @param provide   declared provision keys (`p`)
 * @param apply     the configured effect callback (`e`), already normalized
 */
export class Fiber {
  /** Globally unique fiber identifier. */
  readonly uid: number;

  /** The context under which this fiber was instantiated. */
  readonly parentCtx: RuntimeContext;

  /** The derived child context in which the component's effects run. */
  readonly ctx: RuntimeContext;

  /** Declared dependency keys (`d`). Immutable after construction. */
  readonly inject: Key[];

  /** Declared provision keys (`p`). Immutable after construction. */
  readonly provide: Key[];

  /** Configured effect function (`e`). */
  apply: EffectCallback;

  /** Current lifecycle state. */
  state: LifecycleState;

  /**
   * The desired target view.
   *
   * - `null` means the fiber should not run (`⊥`).
   * - An empty `Map` means the fiber should run but declares no dependencies.
   * - A non-empty `Map` maps each declared key to the UID of the active
   *   provider fiber.
   */
  target: Map<Key, number> | null;

  /**
   * The committed view `ω`: the provider resolution this fiber's current (or
   * last) activation was launched against. Cleared only after `dispose()` has
   * run.
   */
  committed: Map<Key, number> | null;

  /** The accumulator of all inverses installed by this fiber's effects. */
  dispose: Dispose;

  /** Handle to the transition currently in flight, or `null` when idle. */
  inertia: Promise<void> | null;

  /** Retirement flag `τ`. Monotone: once true, never becomes false. */
  retired: boolean;

  /** Per-fiber error outcome, or `null` when no failure has occurred. */
  error: unknown | null;

  /** Resolvers waiting for the fiber to reach `INACTIVE` or `FAILED`. */
  private readonly _waiters: Set<() => void> = new Set();

  /**
   * Creates a fiber.
   *
   * The child context is derived immediately, and this fiber is bound to that
   * context so that proxy-mediated access can walk the fiber chain.
   */
  constructor(
    parentCtx: RuntimeContext,
    inject: Key[],
    provide: Key[],
    apply: EffectCallback,
  ) {
    this.uid = allocateUid();
    this.parentCtx = parentCtx;
    this.inject = Array.from(new Set(inject));
    this.provide = Array.from(new Set(provide));
    this.apply = apply;
    this.state = 'INACTIVE';
    this.target = null;
    this.committed = null;
    this.dispose = () => {
      /* identity accumulator */
    };
    this.inertia = null;
    this.retired = false;
    this.error = null;

    // Derive a private child context for this fiber and bind the fiber to it.
    this.ctx = parentCtx.derive();
    this.ctx._setFiber(this);
  }

  /**
   * Recomputes the fiber's target view and starts or stops transitions as
   * needed. This is a thin delegation to `Lifecycle.refresh`; it is exposed on
   * the fiber so that components, the loader and tests can re-evaluate a
   * single fiber without reaching into the lifecycle engine.
   */
  refresh(): void {
    Lifecycle.refresh(this);
  }

  /**
   * Resolves when the fiber reaches `INACTIVE` or `FAILED`.
   *
   * This is the runtime form of "no longer installed" used by guarded
   * withdrawal: an unloading provider awaits each notified dependent through
   * this method before running its own accumulator.
   */
  async awaitQuiescence(): Promise<void> {
    if (this.state === 'INACTIVE' || this.state === 'FAILED') {
      return;
    }

    await new Promise<void>((resolve) => {
      this._waiters.add(resolve);
    });
  }

  /**
   * Marks the fiber as retired (`τ := ⊤`) and re-evaluates its lifecycle.
   *
   * This is the runtime `O-Retire` action. Once retired, `computeTarget` will
   * always return `null`, so the fiber cannot be reactivated. Re-enabling a
   * previously disabled entry must therefore create a fresh fiber.
   */
  markRetired(): void {
    if (!this.retired) {
      this.retired = true;
    }

    // Always refresh, even if the flag was already set, so that any
    // inconsistent state is driven toward quiescence.
    Lifecycle.refresh(this);
  }

  /**
   * @internal
   *
   * Resolves all waiters blocked on `awaitQuiescence()`.
   *
   * This is called by `Lifecycle` after the fiber reaches `INACTIVE` or
   * `FAILED`. It is not part of the public fiber contract; external code
   * should rely on `awaitQuiescence()` alone.
   */
  _settle(): void {
    const waiters = Array.from(this._waiters);
    this._waiters.clear();

    for (const resolve of waiters) {
      resolve();
    }
  }
}
