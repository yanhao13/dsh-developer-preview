/**
 * Section 3.3: the unified context Γ∞ = μΓ. Γ × (Γ → Γ) × Σ (Definition 32)
 * and the observational equivalence assembled from per-key ≃k (Definitions
 * 33-38). Recovery equalities of Section 3.1 hold up to this equivalence
 * (Lemma 38): the witness condition relaxes from g(δ) = γ to g(δ) ≃ γ, and
 * maps/inverses must respect the equivalence.
 */
import { type Effect, type EffectContext, identity, initialEffectContext, recover, track } from './core.ts';
/**
 * The unified context (Definition 32): a self-similar triple
 * (state, accumulator, coeffects). `state` is the previous context level and
 * `accumulator` recovers this level's effects; `coeffects` carries the
 * dependency information. The root context is the fixed point whose state is
 * itself and whose accumulator is the identity.
 */
export interface UnifiedContext<S> {
    readonly state: UnifiedContext<S>;
    readonly accumulator: (context: UnifiedContext<S>) => UnifiedContext<S>;
    readonly coeffects: S;
}
/** The root of the context tower: state is itself, accumulator is id. */
export declare const rootContext: <S>(coeffects: S) => UnifiedContext<S>;
/** Derive a child level over `parent`, with its own coeffect table. */
export declare const childContext: <S>(parent: UnifiedContext<S>, coeffects: S) => UnifiedContext<S>;
/**
 * An equivalence on contexts (Definition 33): two contexts are related when
 * their coeffect projections bind the same keys to ≃k-related values. The
 * accumulator and state are NOT compared — what no key binds is forgotten.
 */
export interface ContextEquivalence<S> {
    readonly eq: (a: S, b: S) => boolean;
}
export type UnifiedContextEq<S> = (a: UnifiedContext<S>, b: UnifiedContext<S>) => boolean;
/** γ ≃ γ′ — coeffect projections related (Definition 33, formula 32). */
export declare const contextEq: <S>(equiv: ContextEquivalence<S>) => UnifiedContextEq<S>;
/**
 * A map respects ≃ (Definition 36): related inputs produce related outputs —
 * the map descends to the quotient.
 */
export declare const respects: <S>(f: (c: UnifiedContext<S>) => UnifiedContext<S>, eq: UnifiedContextEq<S>, domain: readonly UnifiedContext<S>[]) => boolean;
/** Two maps are related: they agree up to ≃ at every state (Definition 36). */
export declare const mapsRelated: <S>(f: (c: UnifiedContext<S>) => UnifiedContext<S>, g: (c: UnifiedContext<S>) => UnifiedContext<S>, eq: UnifiedContextEq<S>, domain: readonly UnifiedContext<S>[]) => boolean;
/**
 * An effect function read up to ≃ (Definition 37): e respects ≃ as a map
 * Γ → ∂Γ, the witness relaxes to g(δ) ≃ γ, and the returned inverse respects
 * ≃. Taking ≃ to be equality recovers Definition 8.
 */
export declare const witnessedUpTo: <S>(e: Effect<UnifiedContext<S>>, eq: UnifiedContextEq<S>, domain: readonly UnifiedContext<S>[]) => boolean;
/**
 * Section 3.1 replayed up to ≃ (Lemma 38): Theorem 7's recovery invariance
 * and Theorem 16's LIFO reversion, with `=` replaced by `≃` and the soundness
 * invariant read as φ(γ) ≃ γ0. The helpers below exercise exactly those
 * statements on caller-supplied domains.
 */
export interface UpToEqRunner<S> {
    /** Apply a witnessed-up-to-≃ effect through track, then check Theorem 7 up to ≃. */
    readonly theorem7: (f: (c: UnifiedContext<S>) => UnifiedContext<S>, g: (c: UnifiedContext<S>) => UnifiedContext<S>, d: EffectContext<UnifiedContext<S>>, gamma0: UnifiedContext<S>) => boolean;
}
/** Theorem 7 up to ≃: recover(track(f,g)(γ,φ)) ≃ recover(γ,φ) when g(f(γ)) ≃ γ. */
export declare const theorem7UpTo: <S>(eq: UnifiedContextEq<S>, f: (c: UnifiedContext<S>) => UnifiedContext<S>, g: (c: UnifiedContext<S>) => UnifiedContext<S>, d: EffectContext<UnifiedContext<S>>, gamma: UnifiedContext<S>) => boolean;
export { identity, initialEffectContext, recover, track };
