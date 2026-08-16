/**
 * Section 3.1 executable checks: each test below is a theorem from the paper,
 * numbered to match. The context Γ is instantiated with the nine-state domain
 * from helpers.ts, so function equalities are exhaustive rather than sampled.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  compose,
  diamond,
  effectLift,
  effectUnit,
  initialEffectContext,
  recover,
  track,
  twisted,
  type ContextTransform,
  type Effect,
  type EffectContext,
} from '../src/core.ts'
import {
  applySequence,
  isWitnessed,
  independent,
  pairwiseIndependent,
} from '../src/effects.ts'
import {
  domain,
  eqCtx,
  eqEffectContext,
  eqEff,
  eqFn,
  mulberry32,
  type Ctx,
} from './helpers.ts'

// ---------------------------------------------------------------------------
// A battery of effect functions over the nine-state domain.

/** x ↦ x+1 (mod 3), with the uniform inverse x ↦ x+2. */
const incX: ContextTransform<Ctx> = (c) => ({ x: ((c.x + 1) % 3) as Ctx['x'], y: c.y })
const decX: ContextTransform<Ctx> = (c) => ({ x: ((c.x + 2) % 3) as Ctx['x'], y: c.y })
/** y ↦ y+1 (mod 3), with the uniform inverse y ↦ y+2. */
const incY: ContextTransform<Ctx> = (c) => ({ x: c.x, y: ((c.y + 1) % 3) as Ctx['y'] })
const decY: ContextTransform<Ctx> = (c) => ({ x: c.x, y: ((c.y + 2) % 3) as Ctx['y'] })
/** Swaps x and y; its own inverse. */
const swap: ContextTransform<Ctx> = (c) => ({ x: c.y, y: c.x })

/** The effect induced by a pair (f, g): forward f, inverse g at every state. */
const induced = (f: ContextTransform<Ctx>, g: ContextTransform<Ctx>): Effect<Ctx> => (c) => [f(c), g]

const incXEff = induced(incX, decX)
const incYEff = induced(incY, decY)
const swapEff = induced(swap, swap)
const decXEff = induced(decX, incX)
/**
 * A witnessed effect whose inverse is NOT uniform: at state γ it yields the
 * constant map to γ, so it reverts its own application (g(δ) = γ) while
 * g ∘ f ≠ idΓ.
 */
const stateDepEff: Effect<Ctx> = (gamma) => [incX(gamma), () => gamma]

const battery: readonly Effect<Ctx>[] = [incXEff, decXEff, incYEff, swapEff, stateDepEff]

describe('3.1 revertible effects', () => {
  it('Theorem 4: pr1 ∘ track(f, g) = f ∘ pr1', () => {
    const pairs: readonly (readonly [ContextTransform<Ctx>, ContextTransform<Ctx>])[] = [
      [incX, decX],
      [incY, decY],
      [swap, swap],
      [compose(incX, incY), compose(decY, decX)],
    ]
    for (const [f, g] of pairs) {
      for (const gamma of domain) {
        const d: EffectContext<Ctx> = { state: gamma, accumulator: swap }
        assert.deepEqual(track(f, g)(d).state, f(gamma))
      }
    }
  })

  it('Theorem 5: track is a monoid homomorphism from the twisted monoid', () => {
    // Unit is carried to the unit.
    for (const gamma of domain) {
      for (const phi of [undefined, swap, incX, incY] as const) {
        const d: EffectContext<Ctx> = { state: gamma, accumulator: phi ?? ((c: Ctx) => c) }
        assert.ok(eqEffectContext(track((c) => c, (c) => c)(d), d))
      }
    }
    // Multiplication is preserved: track(p1 ∘ p2) = track(p1) ∘ track(p2).
    const p1: readonly [ContextTransform<Ctx>, ContextTransform<Ctx>] = [incX, decX]
    const p2: readonly [ContextTransform<Ctx>, ContextTransform<Ctx>] = [incY, decY]
    const [f, g] = twisted(p1, p2)
    for (const gamma of domain) {
      const d: EffectContext<Ctx> = { state: gamma, accumulator: swap }
      const lhs = track(f, g)(d)
      const rhs = track(...p1)(track(...p2)(d))
      assert.ok(eqEffectContext(lhs, rhs), `gamma=${JSON.stringify(gamma)}`)
    }
  })

  it('Theorem 7: recovery is invariant under a reverted effect', () => {
    for (const gamma of domain) {
      for (const phi of [undefined, swap, incX] as const) {
        const d: EffectContext<Ctx> = { state: gamma, accumulator: phi ?? ((c: Ctx) => c) }
        for (const [f, g] of [[incX, decX], [incY, decY], [swap, swap]] as const) {
          assert.ok(eqEffectContext(recover(track(f, g)(d)), recover(d)))
        }
      }
    }
  })

  it('Theorem 10: (𝔈, ⋄) is a monoid, and pairs embed homomorphically', () => {
    // Associativity.
    const e1 = incXEff, e2 = incYEff, e3 = swapEff
    const lhs = diamond(diamond(e1, e2), e3)
    const rhs = diamond(e1, diamond(e2, e3))
    assert.ok(eqEff(lhs, rhs))
    // Unit laws.
    const eta = effectUnit<Ctx>()
    for (const e of battery) {
      assert.ok(eqEff(diamond(eta, e), e))
      assert.ok(eqEff(diamond(e, eta), e))
    }
    // Homomorphism: image of twisted composition equals ⋄ of images.
    const img = (f: ContextTransform<Ctx>, g: ContextTransform<Ctx>): Effect<Ctx> => induced(f, g)
    const hom = diamond(img(incX, decX), img(incY, decY))
    const [f, g] = twisted([incX, decX], [incY, decY])
    assert.ok(eqEff(hom, img(f, g)))
  })

  it('Theorem 11: 𝔈* is a submonoid, and uniform inverses witness everywhere', () => {
    // Unit is witnessed.
    assert.ok(isWitnessed(effectUnit<Ctx>(), domain, eqCtx))
    // Closure under ⋄: witnessed inputs give a witnessed composite.
    assert.ok(isWitnessed(incXEff, domain, eqCtx))
    assert.ok(isWitnessed(stateDepEff, domain, eqCtx))
    assert.ok(isWitnessed(diamond(incXEff, incYEff), domain, eqCtx))
    assert.ok(isWitnessed(diamond(stateDepEff, incXEff), domain, eqCtx))
    // Any pair with g ∘ f = idΓ induces a witnessed effect.
    assert.ok(isWitnessed(swapEff, domain, eqCtx))
  })

  it('Theorem 13: effect preserves ⋄', () => {
    const lhs = effectLift(diamond(incXEff, incYEff))
    const rhs = diamond(effectLift(incXEff), effectLift(incYEff))
    for (const gamma of domain) {
      const d: EffectContext<Ctx> = { state: gamma, accumulator: swap }
      const [lState, lInv] = lhs(d)
      const [rState, rInv] = rhs(d)
      assert.ok(eqCtx(lState.state, rState.state))
      assert.ok(eqFn(lState.accumulator, rState.accumulator))
      // Compare the lifted inverses behaviorally over effect-context probes.
      for (const probeState of domain) {
        const pd: EffectContext<Ctx> = { state: probeState, accumulator: incX }
        assert.ok(eqEffectContext(lInv(pd), rInv(pd)))
      }
    }
  })

  it('Theorem 14: the lifted effect relates to its source via pr1', () => {
    const e = incYEff
    const f: ContextTransform<Ctx> = (c) => e(c)[0]
    const lifted = effectLift(e)
    for (const gamma of domain) {
      const d: EffectContext<Ctx> = { state: gamma, accumulator: swap }
      const [next, gPrime] = lifted(d)
      // (1) pr1 ∘ f′ = f ∘ pr1
      assert.ok(eqCtx(next.state, f(gamma)))
      // (2) pr1 ∘ g′ = g ∘ pr1
      for (const probeState of domain) {
        const pd: EffectContext<Ctx> = { state: probeState, accumulator: swap }
        assert.ok(eqCtx(gPrime(pd).state, e(gamma)[1](probeState)))
      }
    }
  })

  it('Theorem 15: the lifted inverse recovers the state, and is witnessed iff g ∘ f = idΓ', () => {
    for (const e of battery) {
      const f: ContextTransform<Ctx> = (c) => e(c)[0]
      // g ∘ f = idΓ — the paper's iff-condition. g is the inverse e yields at γ.
      const uniformInverse = domain.every((gamma) => {
        const [, g] = e(gamma)
        return domain.every((c) => eqCtx(g(f(c)), c))
      })
      // effect(e) ∈ 𝔈*∂Γ. φ = swap suffices to probe the accumulator: swap is a
      // bijection, so swap ∘ h = swap iff h = id.
      const liftedWitnessed = domain.every((gamma) => {
        const d: EffectContext<Ctx> = { state: gamma, accumulator: swap }
        const [next, inv] = effectLift(e)(d)
        return eqEffectContext(inv(next), d)
      })
      assert.equal(liftedWitnessed, uniformInverse)
      for (const gamma of domain) {
        for (const phi of [undefined, swap, incX] as const) {
          const d: EffectContext<Ctx> = { state: gamma, accumulator: phi ?? ((c: Ctx) => c) }
          const [, g] = e(gamma)
          const [deltaBig, gPrime] = effectLift(e)(d)
          // g′(Δ) = (γ, φ ∘ g ∘ f): the state is recovered exactly...
          const reverted = gPrime(deltaBig)
          assert.ok(eqCtx(reverted.state, gamma))
          // ...and the soundness invariant is preserved: (φ ∘ g ∘ f)(γ) = φ(γ).
          assert.ok(eqCtx(compose(d.accumulator, compose(g, f))(gamma), d.accumulator(gamma)))
        }
      }
    }
  })

  it('Theorem 16: LIFO reversion recovers each state its application ran against', () => {
    const random = mulberry32(0x3a16)
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + Math.floor(random() * 6)
      const effects = Array.from({ length: n }, () => battery[Math.floor(random() * battery.length)]!)
      const gamma0 = domain[Math.floor(random() * domain.length)]!
      const applied = applySequence(effects, gamma0)
      // Revert in reverse order.
      let state = applied.at(-1)!.after
      for (let i = applied.length - 1; i >= 0; i--) {
        const step = applied[i]!
        state = step.inverse(state)
        assert.ok(eqCtx(state, step.before), `trial ${trial} step ${i}`)
      }
      assert.ok(eqCtx(state, gamma0))
      // Every intermediate state satisfies the soundness invariant φ(γ) = γ0.
      let current = gamma0
      let accumulator: ContextTransform<Ctx> = (c) => c
      for (const step of applied) {
        accumulator = compose(accumulator, step.inverse)
        current = step.after
        assert.ok(eqCtx(accumulator(current), gamma0), `soundness trial ${trial}`)
      }
    }
  })

  it('Theorem 20 + Corollary 21: independent effects revert in any order', () => {
    // incX, decX, incY touch independent coordinates and carry uniform inverses,
    // so they are pairwise independent; swap is not.
    const family = [incXEff, decXEff, incYEff]
    assert.ok(pairwiseIndependent(family, domain, eqCtx))
    assert.ok(!independent(incXEff, swapEff, domain, eqCtx))
    assert.ok(!independent(stateDepEff, incYEff, domain, eqCtx))
    const random = mulberry32(0x21c0)
    for (let trial = 0; trial < 100; trial++) {
      const n = 1 + Math.floor(random() * 5)
      const effects = Array.from({ length: n }, () => family[Math.floor(random() * family.length)]!)
      const gamma0 = domain[Math.floor(random() * domain.length)]!
      const applied = applySequence(effects, gamma0)
      const finalState = applied.at(-1)!.after
      // Theorem 20(1): omitting e_j, later states satisfy δ_u = f_j(δ′_u) and g_j(δ_u) = δ′_u.
      for (let j = 0; j < n; j++) {
        let deltaPrime = applied[j]!.before
        for (let u = j; u < n; u++) {
          assert.ok(eqCtx(applied[u]!.after, applied[j]!.effect(deltaPrime)[0]), `Thm20 trial ${trial} j=${j} u=${u} a`)
          assert.ok(eqCtx(applied[j]!.inverse(applied[u]!.after), deltaPrime), `Thm20 trial ${trial} j=${j} u=${u} b`)
          if (u + 1 < n) deltaPrime = applied[u + 1]!.effect(deltaPrime)[0]
        }
      }
      // Corollary 21: applying all n inverses at the final state in ANY
      // permutation order reaches γ0.
      for (let permTrial = 0; permTrial < 30; permTrial++) {
        const order = applied.map((_, i) => i)
        for (let i = order.length - 1; i > 0; i--) {
          const k = Math.floor(random() * (i + 1))
          ;[order[i], order[k]] = [order[k]!, order[i]!]
        }
        let state = finalState
        for (const idx of order) state = applied[idx]!.inverse(state)
        assert.ok(eqCtx(state, gamma0), `Cor21 trial ${trial} perm ${permTrial}`)
      }
    }
  })
})
