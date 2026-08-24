/**
 * src/types.ts
 *
 * The shared type contract for the Cordis reproduction.
 *
 * The `Context` and `Fiber` classes are imported type-only from their
 * implementation modules (no runtime import), so every shared type below can
 * reference the real class types instead of shadowing structural interfaces.
 *
 * The types intentionally parallel the formal artifacts of the paper:
 *
 * - `EffectCallback` / `Dispose` / `Inverse` correspond to `𝔈iter Γ` and `𝔈* Γ`.
 * - `Component` corresponds to the triple `(d, p, e)` from Definition 43.
 * - `Fiber` corresponds to Definition 44.
 * - `Entry` / `LoadedEntry` correspond to Definition 74 and Section 5.2.1.
 * - `Classification` corresponds to the HMR result of Algorithm 8.
 * - `Change` is the keyed reconciliation diff produced by the loader.
 */

import type { Context } from './context';
export type { Context } from './context';
import type { Fiber } from './fiber';
export type { Fiber } from './fiber';

/** Coeffect dependency / provider key (`K` in the paper). */
export type Key = string | symbol;

/** Isolation realm identifier (`R` in the paper, with `R ⊇ K`). */
export type Realm = symbol | string;

/** Per-key interception metadata (`ℳ_k` in the paper). */
export type Metadata = unknown;

/** A reversible inverse / cleanup function. */
export type Dispose = () => void | Promise<void>;

/** Alias for readability: an inverse is a dispose. */
export type Inverse = Dispose;

/** Synchronous predicate consulted before each effect iterator step. */
export type Guard = () => boolean;

/**
 * An async generator that yields one inverse per effect step.
 *
 * Calling the callback returns either:
 *  1. an `AsyncGenerator` of inverses (the iterator form, `𝔈iter Γ`), or
 *  2. a function that itself is the one-shot inverse (the plain effect form).
 *
 * The `EffectEngine.execute` implementation normalizes the second case into a
 * one-element iterator.
 */
export type EffectIterator = AsyncGenerator<Inverse, void, unknown>;

/** Callback accepted by `ctx.effect` and by a component's `apply`. */
export type EffectCallback = () => EffectIterator | (() => Inverse | void);

/**
 * Runtime lifecycle states.
 *
 * - `INACTIVE`  — `Inactive(⊥)` / `Inactive(ξ)` when no error is carried.
 * - `LOADING`   — `Reloading(i, g, ω)`.
 * - `ACTIVE`    — `Active(g, ω)`.
 * - `UNLOADING` — `Unloading(g, ω, ζ)`.
 * - `FAILED`    — `Inactive(ξ)` with a non-`⊥` error outcome.
 */
export type LifecycleState = 'INACTIVE' | 'LOADING' | 'ACTIVE' | 'UNLOADING' | 'FAILED';

/**
 * A runtime fiber: one instantiation of a component.
 *
 * This is a structural interface implemented by the `Fiber` class in
 * `fiber.ts`.  UIDs are globally unique and never reused, so replacing a
 * provider changes the UID observed in target / committed views even if the
 * provided value is observably equal.
 */
/**
 * The first-class unified context (`Γ∞`).
 *
 * This structural interface is implemented by the `Context` class in
 * `context.ts`.  All coeffect access flows through this surface; the
 * symbol-keyed `@@store`, `@@isolate` and `@@intercept` slots remain private.
 */
/**
 * A component: the declarative triple `(d, p, e)` from Definition 43.
 */
export interface Component {
  /** Dependency coefficients required from the environment (`d`). */
  inject: Key[];

  /** Keys this component may provide to the environment (`p`). */
  provide: Key[];

  /**
   * The effect function (`e`) that is executed when the component is loaded.
   *
   * The runtime accepts either an `EffectCallback` or a bare `Dispose`.
   * `Lifecycle.use` normalizes this value so that `fiber.apply` is always an
   * `EffectCallback`.
   */
  apply(ctx: Context, config: any): EffectCallback | Dispose;
}

/**
 * A declarative loader entry (Definition 74).
 */
export interface Entry {
  /** Stable reconciliation key. */
  id: string;

  /** URL of the component module to instantiate. */
  url: string;

  /** Configuration bound into the component's effect function. */
  config?: any;

  /** Administrative off switch; maps to the retirement flag `τ`. */
  disabled?: boolean;

  /**
   * Isolation annotation:
   * - `true` requests a local realm private to this entry;
   * - a string requests a global realm shared by all entries naming it;
   * - `false` / `undefined` applies no special isolation.
   */
  isolate?: boolean | string;

  /** Interception metadata applied to this entry's context. */
  intercept?: Record<string, Metadata>;

  /** Nested entries for group / include components. */
  children?: Entry[];
}

/**
 * Runtime state of a loaded entry.
 */
export interface LoadedEntry {
  /** Stable reconciliation key. */
  id: string;

  /** URL of the component module. */
  url: string;

  /** Current configuration applied to the fiber. */
  config: any;

  /** Whether the entry is administratively disabled. */
  disabled: boolean;

  /** The fiber instantiated for this entry, or `null` when not loaded. */
  fiber: Fiber | null;

  /** Current isolation realm table for this entry. */
  isolate: Map<Key, Realm>;

  /** Current interception metadata for this entry. */
  intercept: Map<Key, Metadata>;

  /**
   * Apply a new configuration payload.
   *
   * The component decides whether a reload is necessary.
   */
  applyConfig(config: any): Promise<void>;
}

/**
 * HMR module classification result (Algorithm 8).
 */
export interface Classification {
  /** Modules that can be hot-replaced. */
  accepted: Set<string>;

  /** Modules that cannot be hot-replaced and require a full restart. */
  declined: Set<string>;
}

/**
 * One reconciliation change produced by keyed diffing entries by `id`.
 */
export interface Change {
  /** Kind of change. */
  type: 'add' | 'remove' | 'update';

  /** The new / desired entry state.  Present for all change kinds. */
  entry: Entry;

  /** The previous loaded entry for `remove` and `update`, when available. */
  oldEntry?: LoadedEntry;
}
