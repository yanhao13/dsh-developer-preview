/**
 * Section 3.3 executable checks: the unified context Γ∞ (Definition 32) and
 * the observational equivalence (Definitions 33-38), including Theorem 7 read
 * up to ≃ (Lemma 38).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  childContext,
  contextEq,
  mapsRelated,
  respects,
  rootContext,
  theorem7UpTo,
  witnessedUpTo,
  type UnifiedContext,
} from '../src/context.ts'
import { initialEffectContext, recover, track } from '../src/core.ts'
import { CoeffectDefinition, CoeffectTable } from '../src/coeffects.ts'

/** A key whose values are compared exactly. */
const exactDef: CoeffectDefinition = { eq: (a, b) => a === b, operations: {} }
/** A coarse key: every value at this key is observationally equivalent. */
const coarseDef: CoeffectDefinition = { eq: () => true, operations: {} }

const table = (v: unknown, def: CoeffectDefinition): CoeffectTable =>
  CoeffectTable.of(new Map([['n', { value: v, def }]]))

type Ctx = UnifiedContext<CoeffectTable>

const root = (t: CoeffectTable): Ctx => rootContext(t)

describe('3.3 the context paradigm', () => {
  it('Definition 32: the unified context is self-similar', () => {
    const r = root(CoeffectTable.empty())
    assert.equal(r.state, r) // fixed point
    assert.equal(r.accumulator(r), r) // identity accumulator
    const child = childContext(r, table(0, exactDef))
    assert.equal(child.state, r)
    assert.notEqual(child, r)
  })

  it('Definition 33: equivalence compares coeffect projections only', () => {
    const exactEq = contextEq({ eq: (a, b) => a.eq(b) })
    // Same domain, related values → related.
    assert.ok(exactEq(root(table(0, exactDef)), root(table(0, exactDef))))
    // Different value → unrelated under the exact key.
    assert.ok(!exactEq(root(table(0, exactDef)), root(table(1, exactDef))))
    // Different domain → unrelated.
    assert.ok(!exactEq(root(table(0, exactDef)), root(CoeffectTable.empty())))
    // Under the coarse key everything is related — the quotient forgets.
    const coarseEq = contextEq({ eq: (a, b) => a.eq(b) })
    assert.ok(coarseEq(root(table(0, coarseDef)), root(table(1, coarseDef))))
  })

  it('Definition 36: respecting maps descend to the quotient', () => {
    // Structural equality ignores the keys' declared equivalences.
    const structural = (a: CoeffectTable, b: CoeffectTable): boolean => {
      if (a.has('n') !== b.has('n')) return false
      if (!a.has('n')) return true
      return a.get('n').value === b.get('n').value
    }
    // Parity relates any two states that agree on whether n is bound.
    const parity = (a: CoeffectTable, b: CoeffectTable): boolean => a.has('n') === b.has('n')
    const exactEq = contextEq({ eq: structural })
    const parityEq = contextEq({ eq: parity })
    const identity = (c: Ctx): Ctx => c
    // drop maps value 1 to the empty table; 0 ≃ 1 under parity, but their
    // images (bound vs unbound) are not parity-related — drop does not descend.
    const drop = (c: Ctx): Ctx =>
      c.coeffects.has('n') && c.coeffects.get('n').value === 1 ? root(CoeffectTable.empty()) : c
    const domain = [root(table(0, exactDef)), root(table(1, exactDef)), root(CoeffectTable.empty())]
    assert.ok(respects(identity, exactEq, domain))
    assert.ok(respects(drop, exactEq, domain)) // no distinct related pairs under structural eq
    assert.ok(!respects(drop, parityEq, domain)) // 0 ≃ 1 but images differ
    assert.ok(respects(identity, parityEq, domain))
    assert.ok(mapsRelated(identity, identity, exactEq, domain))
  })

  it('Definitions 37-38: witness relaxes to ≃, and Theorem 7 holds up to ≃', () => {
    // Under the coarse key, an effect whose inverse restores a different-but-
    // related value is witnessed up to ≃ but not strictly.
    const coarseEq = contextEq({ eq: (a, b) => a.eq(b) })
    const structural = (a: CoeffectTable, b: CoeffectTable): boolean => {
      if (a.has('n') !== b.has('n')) return false
      if (!a.has('n')) return true
      return a.get('n').value === b.get('n').value
    }
    const structuralEq = contextEq({ eq: structural })
    const coarseDomain = [root(table(0, coarseDef)), root(table(1, coarseDef))]
    // e binds value 0 at a fresh derived level; its inverse lands on a root
    // binding the ≃-related value 1, so recovery is exact only up to ≃.
    const e = (gamma: Ctx): readonly [Ctx, (c: Ctx) => Ctx] => {
      const next = childContext(gamma, table(0, coarseDef))
      return [next, () => root(table(1, coarseDef))]
    }
    assert.ok(!witnessedUpTo(e, structuralEq, coarseDomain))
    assert.ok(witnessedUpTo(e, coarseEq, coarseDomain))
    // Theorem 7 up to ≃: with g(f(γ)) ≃ γ, recovery is invariant up to ≃.
    const f = (c: Ctx): Ctx => childContext(c, table(0, coarseDef))
    const g = (): Ctx => root(table(1, coarseDef))
    const gamma = root(table(0, coarseDef))
    const d = initialEffectContext(gamma)
    assert.ok(theorem7UpTo(coarseEq, f, g, d, gamma))
    // Concretely: recover(track(f,g)(γ,φ)) is ≃-related to recover(γ,φ) but not
    // structurally equal.
    const after = recover(track(f, g)(d))
    const plain = recover(d)
    assert.ok(coarseEq(after.state, plain.state))
    assert.ok(!structuralEq(after.state, plain.state))
    assert.ok(!(after.state === plain.state))
  })
})
