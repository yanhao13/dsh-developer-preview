/**
 * Section 3.1.3: independence of effects, plus the executable witness check
 * for 𝔈*Γ (Definition 8). The paper's 𝔈*Γ is a dependent-type refinement; here
 * the witness is a runtime predicate evaluated over a caller-supplied state
 * domain (exhaustive for finite instantiations, sampled otherwise).
 */
import { compose } from './core.ts';
/**
 * Whether an effect function lies in 𝔈*Γ (Definition 8): at every state γ in
 * the domain, the inverse the effect yields reverts the state it was applied
 * at, i.e. g(δ) = γ where (δ, g) = e(γ).
 */
export const isWitnessed = (e, domain, eq) => domain.every((gamma) => {
    const [delta, g] = e(gamma);
    return eq(g(delta), gamma);
});
/**
 * The generating set of the transformation monoid 𝔐(e) (Definition 17): the
 * forward map of e together with every inverse e yields on the domain.
 */
export const monoidGenerators = (e, domain) => [
    (c) => e(c)[0],
    ...domain.map((gamma) => e(gamma)[1]),
];
/** Whether two transformations commute on the domain. */
export const commutes = (f, g, domain, eq) => domain.every((c) => eq(f(g(c)), g(f(c))));
/**
 * Independence of two effect functions (Definition 19): every transformation
 * of one commutes with every transformation of the other (checked on the
 * generators, which suffices by Lemma 18), and neither one's transformations
 * disturb the inverse the other yields.
 */
export const independent = (e1, e2, domain, eq) => {
    const gens1 = monoidGenerators(e1, domain);
    const gens2 = monoidGenerators(e2, domain);
    const clause1 = gens1.every((f) => gens2.every((g) => commutes(f, g, domain, eq)));
    const stable = (e, foreign) => foreign.every((g) => domain.every((gamma) => {
        const moved = e(g(gamma))[1];
        const original = e(gamma)[1];
        return domain.every((c) => eq(moved(c), original(c)));
    }));
    const clause2 = stable(e1, gens2) && stable(e2, gens1);
    return clause1 && clause2;
};
/** Pairwise independence of a family (Definition 19). */
export const pairwiseIndependent = (effects, domain, eq) => effects.every((a, i) => effects.every((b, j) => i === j || independent(a, b, domain, eq)));
export const applySequence = (effects, initial) => {
    const applied = [];
    let state = initial;
    for (const effect of effects) {
        const [next, inverse] = effect(state);
        applied.push({ effect, before: state, after: next, inverse });
        state = next;
    }
    return applied;
};
/** Compose a list of transformations left-to-right in the given order. */
export const foldTransforms = (transforms) => (c) => transforms.reduce((acc, t) => t(acc), c);
export { compose };
