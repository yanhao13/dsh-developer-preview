/**
 * Executable encoding of the paper's Section 3.1 machinery, all polymorphic in
 * the context type `C` (the paper's Γ). Everything here is pure and total.
 *
 * Paper reference: "A Programming Paradigm for Spatiotemporal Composability",
 * Section 3.1 "Revertible Effects". Definition/theorem numbers below match the
 * paper's numbering.
 */
/** Identity transformation — the paper's idΓ. */
export const identity = () => (context) => context;
/** Ordinary function composition: (f ∘ g)(x) = f(g(x)). */
export const compose = (f, g) => (a) => f(g(a));
/** The twisted composition monoid 𝔗Γ (Definition 1). */
export const twisted = (p1, p2) => [compose(p1[0], p2[0]), compose(p2[1], p1[1])];
/** The unit of 𝔗Γ: (idΓ, idΓ). */
export const twistedUnit = () => [identity(), identity()];
/** The initial effect context (γ0, idΓ) (Definition 2). */
export const initialEffectContext = (state) => ({ state, accumulator: identity() });
/**
 * trackΓ (Definition 3): lift a pair of context transformations to a
 * transformation of the effect context. `track(f, g)(γ, φ) = (f(γ), φ ∘ g)`.
 */
export const track = (forward, inverse) => (d) => ({
    state: forward(d.state),
    accumulator: compose(d.accumulator, inverse),
});
/**
 * recoverΓ (Definition 6): apply the accumulator to the current state and
 * reset it to the identity. `recover(γ, φ) = (φ(γ), idΓ)`.
 */
export const recover = (d) => ({
    state: d.accumulator(d.state),
    accumulator: identity(),
});
/** The unit of (𝔈Γ, ⋄): ηΓ = γ ↦ (γ, idΓ) (Theorem 10). */
export const effectUnit = () => (context) => [context, identity()];
/**
 * Effect composition ⋄ (Definition 9): `(f ⋄ g)(γ)` runs `g` then `f` and
 * composes the inverses in the opposite order.
 */
export const diamond = (f, g) => (context) => {
    const [delta, s] = g(context);
    const [epsilon, t] = f(delta);
    return [epsilon, compose(s, t)];
};
/**
 * effectΓ (Definition 12): lift an effect function on Γ to an effect function
 * on ∂Γ. `effect(e)(γ, φ) = ((δ, φ ∘ g), track(g, pr1 ∘ e))` where
 * `(δ, g) = e(γ)`.
 */
export const effectLift = (e) => (d) => {
    const [delta, g] = e(d.state);
    const next = { state: delta, accumulator: compose(d.accumulator, g) };
    const inverse = track(g, (c) => e(c)[0]);
    return [next, inverse];
};
