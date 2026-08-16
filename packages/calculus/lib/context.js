/**
 * Section 3.3: the unified context Γ∞ = μΓ. Γ × (Γ → Γ) × Σ (Definition 32)
 * and the observational equivalence assembled from per-key ≃k (Definitions
 * 33-38). Recovery equalities of Section 3.1 hold up to this equivalence
 * (Lemma 38): the witness condition relaxes from g(δ) = γ to g(δ) ≃ γ, and
 * maps/inverses must respect the equivalence.
 */
import { identity, initialEffectContext, recover, track } from './core.ts';
/** The root of the context tower: state is itself, accumulator is id. */
export const rootContext = (coeffects) => {
    const root = {
        state: undefined,
        accumulator: (context) => context,
        coeffects,
    };
    root.state = root;
    return root;
};
/** Derive a child level over `parent`, with its own coeffect table. */
export const childContext = (parent, coeffects) => ({
    state: parent,
    accumulator: identity(),
    coeffects,
});
/** γ ≃ γ′ — coeffect projections related (Definition 33, formula 32). */
export const contextEq = (equiv) => (a, b) => equiv.eq(a.coeffects, b.coeffects);
/**
 * A map respects ≃ (Definition 36): related inputs produce related outputs —
 * the map descends to the quotient.
 */
export const respects = (f, eq, domain) => domain.every((a) => domain.every((b) => !eq(a, b) || eq(f(a), f(b))));
/** Two maps are related: they agree up to ≃ at every state (Definition 36). */
export const mapsRelated = (f, g, eq, domain) => domain.every((c) => eq(f(c), g(c)));
/**
 * An effect function read up to ≃ (Definition 37): e respects ≃ as a map
 * Γ → ∂Γ, the witness relaxes to g(δ) ≃ γ, and the returned inverse respects
 * ≃. Taking ≃ to be equality recovers Definition 8.
 */
export const witnessedUpTo = (e, eq, domain) => {
    // e respects ≃ as a map into ∂Γ: related inputs yield related states AND
    // related inverses (Definition 36 read one level up).
    const asPair = (c) => e(c);
    const statesRespect = domain.every((a) => domain.every((b) => !eq(a, b) || eq(asPair(a)[0], asPair(b)[0])));
    const inversesRespect = domain.every((a) => domain.every((b) => !eq(a, b) || mapsRelated(asPair(a)[1], asPair(b)[1], eq, domain)));
    if (!statesRespect || !inversesRespect)
        return false;
    return domain.every((gamma) => {
        const [delta, g] = e(gamma);
        return eq(g(delta), gamma) && respects(g, eq, domain);
    });
};
/** Theorem 7 up to ≃: recover(track(f,g)(γ,φ)) ≃ recover(γ,φ) when g(f(γ)) ≃ γ. */
export const theorem7UpTo = (eq, f, g, d, gamma) => {
    if (!eq(g(f(gamma)), gamma))
        return true; // hypothesis must hold; vacuously skip
    return eq(recover(track(f, g)(d)).state, recover(d).state);
};
export { identity, initialEffectContext, recover, track };
