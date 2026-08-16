/**
 * Executable encoding of the paper's Section 3.1 machinery, all polymorphic in
 * the context type `C` (the paper's Γ). Everything here is pure and total.
 *
 * Paper reference: "A Programming Paradigm for Spatiotemporal Composability",
 * Section 3.1 "Revertible Effects". Definition/theorem numbers below match the
 * paper's numbering.
 */
/** A context transformation: the paper's Γ → Γ. */
export type ContextTransform<C> = (context: C) => C;
/**
 * A revertible effect function: the paper's 𝔈Γ = Γ → Γ × (Γ → Γ).
 * Applied to a context it yields the transformed context and the inverse that
 * reverts that transformation at that state (Definition 8).
 */
export type Effect<C> = (context: C) => readonly [next: C, inverse: ContextTransform<C>];
/** The effect context: the paper's ∂Γ = Γ × (Γ → Γ) (Definition 2). */
export interface EffectContext<C> {
    /** Current context state — the paper's γ. */
    readonly state: C;
    /**
     * Accumulator — the paper's φ: the composite of the inverses of the effects
     * performed so far; applying it recovers the context to its initial state.
     */
    readonly accumulator: ContextTransform<C>;
}
/** Identity transformation — the paper's idΓ. */
export declare const identity: <C>() => ContextTransform<C>;
/** Ordinary function composition: (f ∘ g)(x) = f(g(x)). */
export declare const compose: <A, B, Cc>(f: (b: B) => Cc, g: (a: A) => B) => ((a: A) => Cc);
/** The twisted composition monoid 𝔗Γ (Definition 1). */
export declare const twisted: <C>(p1: readonly [ContextTransform<C>, ContextTransform<C>], p2: readonly [ContextTransform<C>, ContextTransform<C>]) => readonly [ContextTransform<C>, ContextTransform<C>];
/** The unit of 𝔗Γ: (idΓ, idΓ). */
export declare const twistedUnit: <C>() => readonly [ContextTransform<C>, ContextTransform<C>];
/** The initial effect context (γ0, idΓ) (Definition 2). */
export declare const initialEffectContext: <C>(state: C) => EffectContext<C>;
/**
 * trackΓ (Definition 3): lift a pair of context transformations to a
 * transformation of the effect context. `track(f, g)(γ, φ) = (f(γ), φ ∘ g)`.
 */
export declare const track: <C>(forward: ContextTransform<C>, inverse: ContextTransform<C>) => ((d: EffectContext<C>) => EffectContext<C>);
/**
 * recoverΓ (Definition 6): apply the accumulator to the current state and
 * reset it to the identity. `recover(γ, φ) = (φ(γ), idΓ)`.
 */
export declare const recover: <C>(d: EffectContext<C>) => EffectContext<C>;
/** The unit of (𝔈Γ, ⋄): ηΓ = γ ↦ (γ, idΓ) (Theorem 10). */
export declare const effectUnit: <C>() => Effect<C>;
/**
 * Effect composition ⋄ (Definition 9): `(f ⋄ g)(γ)` runs `g` then `f` and
 * composes the inverses in the opposite order.
 */
export declare const diamond: <C>(f: Effect<C>, g: Effect<C>) => Effect<C>;
/**
 * effectΓ (Definition 12): lift an effect function on Γ to an effect function
 * on ∂Γ. `effect(e)(γ, φ) = ((δ, φ ∘ g), track(g, pr1 ∘ e))` where
 * `(δ, g) = e(γ)`.
 */
export declare const effectLift: <C>(e: Effect<C>) => Effect<EffectContext<C>>;
