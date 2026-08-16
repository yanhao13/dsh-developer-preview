/**
 * Section 3.1.3: independence of effects, plus the executable witness check
 * for 𝔈*Γ (Definition 8). The paper's 𝔈*Γ is a dependent-type refinement; here
 * the witness is a runtime predicate evaluated over a caller-supplied state
 * domain (exhaustive for finite instantiations, sampled otherwise).
 */
import { compose, type ContextTransform, type Effect } from './core.ts'

/**
 * Whether an effect function lies in 𝔈*Γ (Definition 8): at every state γ in
 * the domain, the inverse the effect yields reverts the state it was applied
 * at, i.e. g(δ) = γ where (δ, g) = e(γ).
 */
export const isWitnessed = <C>(
  e: Effect<C>,
  domain: readonly C[],
  eq: (a: C, b: C) => boolean,
): boolean => domain.every((gamma) => {
  const [delta, g] = e(gamma)
  return eq(g(delta), gamma)
})

/**
 * The generating set of the transformation monoid 𝔐(e) (Definition 17): the
 * forward map of e together with every inverse e yields on the domain.
 */
export const monoidGenerators = <C>(e: Effect<C>, domain: readonly C[]): readonly ContextTransform<C>[] => [
  (c) => e(c)[0],
  ...domain.map((gamma) => e(gamma)[1]),
]

/** Whether two transformations commute on the domain. */
export const commutes = <C>(
  f: ContextTransform<C>,
  g: ContextTransform<C>,
  domain: readonly C[],
  eq: (a: C, b: C) => boolean,
): boolean => domain.every((c) => eq(f(g(c)), g(f(c))))

/**
 * Independence of two effect functions (Definition 19): every transformation
 * of one commutes with every transformation of the other (checked on the
 * generators, which suffices by Lemma 18), and neither one's transformations
 * disturb the inverse the other yields.
 */
export const independent = <C>(
  e1: Effect<C>,
  e2: Effect<C>,
  domain: readonly C[],
  eq: (a: C, b: C) => boolean,
): boolean => {
  const gens1 = monoidGenerators(e1, domain)
  const gens2 = monoidGenerators(e2, domain)
  const clause1 = gens1.every((f) => gens2.every((g) => commutes(f, g, domain, eq)))
  const stable = (e: Effect<C>, foreign: readonly ContextTransform<C>[]): boolean =>
    foreign.every((g) => domain.every((gamma) => {
      const moved = e(g(gamma))[1]
      const original = e(gamma)[1]
      return domain.every((c) => eq(moved(c), original(c)))
    }))
  const clause2 = stable(e1, gens2) && stable(e2, gens1)
  return clause1 && clause2
}

/** Pairwise independence of a family (Definition 19). */
export const pairwiseIndependent = <C>(
  effects: readonly Effect<C>[],
  domain: readonly C[],
  eq: (a: C, b: C) => boolean,
): boolean => effects.every((a, i) => effects.every((b, j) => i === j || independent(a, b, domain, eq)))

/**
 * Apply a sequence of effect functions in order from an initial context,
 * recording the inverse each effect yielded where it was applied — the setup
 * of Theorem 16 and Theorem 20.
 */
export interface AppliedEffect<C> {
  /** The effect that was applied. */
  readonly effect: Effect<C>
  /** The state the effect was applied against. */
  readonly before: C
  /** The state it produced. */
  readonly after: C
  /** The inverse it yielded at `before`. */
  readonly inverse: ContextTransform<C>
}

export const applySequence = <C>(effects: readonly Effect<C>[], initial: C): readonly AppliedEffect<C>[] => {
  const applied: AppliedEffect<C>[] = []
  let state = initial
  for (const effect of effects) {
    const [next, inverse] = effect(state)
    applied.push({ effect, before: state, after: next, inverse })
    state = next
  }
  return applied
}

/** Compose a list of transformations left-to-right in the given order. */
export const foldTransforms = <C>(transforms: readonly ContextTransform<C>[]): ContextTransform<C> =>
  (c) => transforms.reduce((acc, t) => t(acc), c)

export { compose }
