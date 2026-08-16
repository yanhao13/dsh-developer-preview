/**
 * Section 3.3: the unified context Γ∞ = μΓ. Γ × (Γ → Γ) × Σ (Definition 32)
 * and the observational equivalence assembled from per-key ≃k (Definitions
 * 33-38). Recovery equalities of Section 3.1 hold up to this equivalence
 * (Lemma 38): the witness condition relaxes from g(δ) = γ to g(δ) ≃ γ, and
 * maps/inverses must respect the equivalence.
 */
import { type Effect, type EffectContext, identity, initialEffectContext, recover, track } from './core.ts'
import { type CoeffectTable } from './coeffects.ts'

/**
 * The unified context (Definition 32): a self-similar triple
 * (state, accumulator, coeffects). `state` is the previous context level and
 * `accumulator` recovers this level's effects; `coeffects` carries the
 * dependency information. The root context is the fixed point whose state is
 * itself and whose accumulator is the identity.
 */
export interface UnifiedContext<S> {
  readonly state: UnifiedContext<S>
  readonly accumulator: (context: UnifiedContext<S>) => UnifiedContext<S>
  readonly coeffects: S
}

/** The root of the context tower: state is itself, accumulator is id. */
export const rootContext = <S>(coeffects: S): UnifiedContext<S> => {
  const root: UnifiedContext<S> = {
    state: undefined as unknown as UnifiedContext<S>,
    accumulator: (context) => context,
    coeffects,
  }
  ;(root as { state: UnifiedContext<S> }).state = root
  return root
}

/** Derive a child level over `parent`, with its own coeffect table. */
export const childContext = <S>(parent: UnifiedContext<S>, coeffects: S): UnifiedContext<S> => ({
  state: parent,
  accumulator: identity(),
  coeffects,
})

// ---------------------------------------------------------------------------
// Observational equivalence (Definitions 33-38)

/**
 * An equivalence on contexts (Definition 33): two contexts are related when
 * their coeffect projections bind the same keys to ≃k-related values. The
 * accumulator and state are NOT compared — what no key binds is forgotten.
 */
export interface ContextEquivalence<S> {
  readonly eq: (a: S, b: S) => boolean
}

export type UnifiedContextEq<S> = (a: UnifiedContext<S>, b: UnifiedContext<S>) => boolean

/** γ ≃ γ′ — coeffect projections related (Definition 33, formula 32). */
export const contextEq = <S>(equiv: ContextEquivalence<S>): UnifiedContextEq<S> =>
  (a, b) => equiv.eq(a.coeffects, b.coeffects)

/**
 * A map respects ≃ (Definition 36): related inputs produce related outputs —
 * the map descends to the quotient.
 */
export const respects = <S>(
  f: (c: UnifiedContext<S>) => UnifiedContext<S>,
  eq: UnifiedContextEq<S>,
  domain: readonly UnifiedContext<S>[],
): boolean => domain.every((a) => domain.every((b) => !eq(a, b) || eq(f(a), f(b))))

/** Two maps are related: they agree up to ≃ at every state (Definition 36). */
export const mapsRelated = <S>(
  f: (c: UnifiedContext<S>) => UnifiedContext<S>,
  g: (c: UnifiedContext<S>) => UnifiedContext<S>,
  eq: UnifiedContextEq<S>,
  domain: readonly UnifiedContext<S>[],
): boolean => domain.every((c) => eq(f(c), g(c)))

/**
 * An effect function read up to ≃ (Definition 37): e respects ≃ as a map
 * Γ → ∂Γ, the witness relaxes to g(δ) ≃ γ, and the returned inverse respects
 * ≃. Taking ≃ to be equality recovers Definition 8.
 */
export const witnessedUpTo = <S>(
  e: Effect<UnifiedContext<S>>,
  eq: UnifiedContextEq<S>,
  domain: readonly UnifiedContext<S>[],
): boolean => {
  // e respects ≃ as a map into ∂Γ: related inputs yield related states AND
  // related inverses (Definition 36 read one level up).
  const asPair = (c: UnifiedContext<S>) => e(c)
  const statesRespect = domain.every((a) => domain.every((b) => !eq(a, b) || eq(asPair(a)[0], asPair(b)[0])))
  const inversesRespect = domain.every((a) => domain.every((b) => !eq(a, b) || mapsRelated(asPair(a)[1], asPair(b)[1], eq, domain)))
  if (!statesRespect || !inversesRespect) return false
  return domain.every((gamma) => {
    const [delta, g] = e(gamma)
    return eq(g(delta), gamma) && respects(g, eq, domain)
  })
}

/**
 * Section 3.1 replayed up to ≃ (Lemma 38): Theorem 7's recovery invariance
 * and Theorem 16's LIFO reversion, with `=` replaced by `≃` and the soundness
 * invariant read as φ(γ) ≃ γ0. The helpers below exercise exactly those
 * statements on caller-supplied domains.
 */
export interface UpToEqRunner<S> {
  /** Apply a witnessed-up-to-≃ effect through track, then check Theorem 7 up to ≃. */
  readonly theorem7: (f: (c: UnifiedContext<S>) => UnifiedContext<S>, g: (c: UnifiedContext<S>) => UnifiedContext<S>, d: EffectContext<UnifiedContext<S>>, gamma0: UnifiedContext<S>) => boolean
}

/** Theorem 7 up to ≃: recover(track(f,g)(γ,φ)) ≃ recover(γ,φ) when g(f(γ)) ≃ γ. */
export const theorem7UpTo = <S>(
  eq: UnifiedContextEq<S>,
  f: (c: UnifiedContext<S>) => UnifiedContext<S>,
  g: (c: UnifiedContext<S>) => UnifiedContext<S>,
  d: EffectContext<UnifiedContext<S>>,
  gamma: UnifiedContext<S>,
): boolean => {
  if (!eq(g(f(gamma)), gamma)) return true // hypothesis must hold; vacuously skip
  return eq(recover(track(f, g)(d)).state, recover(d).state)
}

export { identity, initialEffectContext, recover, track }
