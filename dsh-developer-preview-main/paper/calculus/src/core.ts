/**
 * Executable encoding of the paper's Section 3.1 machinery, all polymorphic in
 * the context type `C` (the paper's Γ). Everything here is pure and total.
 *
 * Paper reference: "A Programming Paradigm for Spatiotemporal Composability",
 * Section 3.1 "Revertible Effects". Definition/theorem numbers below match the
 * paper's numbering.
 */

/** A context transformation: the paper's Γ → Γ. */
export type ContextTransform<C> = (context: C) => C

/**
 * A revertible effect function: the paper's 𝔈Γ = Γ → Γ × (Γ → Γ).
 * Applied to a context it yields the transformed context and the inverse that
 * reverts that transformation at that state (Definition 8).
 */
export type Effect<C> = (context: C) => readonly [next: C, inverse: ContextTransform<C>]

/** The effect context: the paper's ∂Γ = Γ × (Γ → Γ) (Definition 2). */
export interface EffectContext<C> {
  /** Current context state — the paper's γ. */
  readonly state: C
  /**
   * Accumulator — the paper's φ: the composite of the inverses of the effects
   * performed so far; applying it recovers the context to its initial state.
   */
  readonly accumulator: ContextTransform<C>
}

/** Identity transformation — the paper's idΓ. */
export const identity = <C>(): ContextTransform<C> => (context) => context

/** Ordinary function composition: (f ∘ g)(x) = f(g(x)). */
export const compose = <A, B, Cc>(
  f: (b: B) => Cc,
  g: (a: A) => B,
): ((a: A) => Cc) => (a) => f(g(a))

/** The twisted composition monoid 𝔗Γ (Definition 1). */
export const twisted = <C>(
  p1: readonly [ContextTransform<C>, ContextTransform<C>],
  p2: readonly [ContextTransform<C>, ContextTransform<C>],
): readonly [ContextTransform<C>, ContextTransform<C>] => [compose(p1[0], p2[0]), compose(p2[1], p1[1])]

/** The unit of 𝔗Γ: (idΓ, idΓ). */
export const twistedUnit = <C>(): readonly [ContextTransform<C>, ContextTransform<C>] => [identity<C>(), identity<C>()]

/** The initial effect context (γ0, idΓ) (Definition 2). */
export const initialEffectContext = <C>(state: C): EffectContext<C> => ({ state, accumulator: identity<C>() })

/**
 * trackΓ (Definition 3): lift a pair of context transformations to a
 * transformation of the effect context. `track(f, g)(γ, φ) = (f(γ), φ ∘ g)`.
 */
export const track = <C>(
  forward: ContextTransform<C>,
  inverse: ContextTransform<C>,
): ((d: EffectContext<C>) => EffectContext<C>) => (d) => ({
  state: forward(d.state),
  accumulator: compose(d.accumulator, inverse),
})

/**
 * recoverΓ (Definition 6): apply the accumulator to the current state and
 * reset it to the identity. `recover(γ, φ) = (φ(γ), idΓ)`.
 */
export const recover = <C>(d: EffectContext<C>): EffectContext<C> => ({
  state: d.accumulator(d.state),
  accumulator: identity<C>(),
})

/** The unit of (𝔈Γ, ⋄): ηΓ = γ ↦ (γ, idΓ) (Theorem 10). */
export const effectUnit = <C>(): Effect<C> => (context) => [context, identity<C>()]

/**
 * Effect composition ⋄ (Definition 9): `(f ⋄ g)(γ)` runs `g` then `f` and
 * composes the inverses in the opposite order.
 */
export const diamond = <C>(f: Effect<C>, g: Effect<C>): Effect<C> => (context) => {
  const [delta, s] = g(context)
  const [epsilon, t] = f(delta)
  return [epsilon, compose(s, t)]
}

/**
 * effectΓ (Definition 12): lift an effect function on Γ to an effect function
 * on ∂Γ. `effect(e)(γ, φ) = ((δ, φ ∘ g), track(g, pr1 ∘ e))` where
 * `(δ, g) = e(γ)`.
 */
export const effectLift = <C>(e: Effect<C>): Effect<EffectContext<C>> => (d) => {
  const [delta, g] = e(d.state)
  const next: EffectContext<C> = { state: delta, accumulator: compose(d.accumulator, g) }
  const inverse = track<C>(g, (c) => e(c)[0])
  return [next, inverse]
}
