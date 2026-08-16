/**
 * Section 3.2 executable checks: the coeffect context, get/set, satisfaction,
 * notify, operation lifts, isolation, interception, and the independence
 * discipline (Definitions 22-31, 39-42). Domains are small enumerations so
 * every claim is checked exhaustively.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  CoeffectDefinition,
  CoeffectEntry,
  CoeffectTable,
  PreconditionError,
  emptyInter,
  emptyIso,
  interGet,
  interSet,
  intercept,
  isoGet,
  isoSet,
  isolate,
  liftOperation,
  liftOperationResult,
  mediated,
  notify,
  realmOf,
  setEffect,
} from '../src/coeffects.ts'
import { effectUnit, type Effect } from '../src/core.ts'
import { independent, isWitnessed } from '../src/effects.ts'

// ---------------------------------------------------------------------------
// Small concrete coeffect domains.

/** Numeric key: toggle between 0 and 1; toggle is its own inverse. */
const numDef: CoeffectDefinition = {
  eq: (a, b) => a === b,
  operations: {
    toggle: {
      apply: (value) => {
        const v = value as 0 | 1
        const next = (v === 0 ? 1 : 0) as 0 | 1
        return { value: next, inverse: (w) => ((w as 0 | 1) === 0 ? 1 : 0), outcome: v }
      },
    },
  },
}

/** List key: push appends; inverse pops. Order-sensitive — non-commutative. */
const listDef: CoeffectDefinition = {
  eq: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  operations: {
    push: {
      apply: (value, arg) => {
        const list = value as number[]
        return {
          value: [...list, arg as number],
          inverse: (w) => (w as number[]).slice(0, -1),
          outcome: arg,
        }
      },
    },
  },
}

const entry = (value: unknown, def: CoeffectDefinition): CoeffectEntry => ({ value, def })

/** All tables over keys a, b with numeric values in {0, 1} or absent. */
const numTables = (): CoeffectTable[] => {
  const tables: CoeffectTable[] = []
  for (const a of [undefined, 0, 1] as const) {
    for (const b of [undefined, 0, 1] as const) {
      const entries = new Map<string, CoeffectEntry>()
      if (a !== undefined) entries.set('a', entry(a, numDef))
      if (b !== undefined) entries.set('b', entry(b, numDef))
      tables.push(CoeffectTable.of(entries))
    }
  }
  return tables
}

/** All tables over key l with list values from a fixed set, or absent. */
const listTables = (): CoeffectTable[] => {
  const values = [[], [1], [2], [1, 2], [2, 1]] as const
  return values
    .map((v) => CoeffectTable.of(new Map([['l', entry([...v], listDef)]])))
    .concat([CoeffectTable.empty()])
}

describe('3.2 reactive coeffects', () => {
  it('Definition 23: set binds and its inverse revokes (get/set preconditions)', () => {
    const sigma = CoeffectTable.empty()
    const [sigma1, unset] = setEffect('a', 0, numDef)(sigma)
    assert.equal(sigma1.get('a').value, 0)
    assert.ok(!sigma1.has('b'))
    assert.throws(() => sigma1.get('b'), PreconditionError)
    // Precondition: a dependency cannot be provided twice.
    assert.throws(() => setEffect('a', 1, numDef)(sigma1), PreconditionError)
    // The inverse deletes the binding.
    const sigma0 = unset(sigma1)
    assert.ok(!sigma0.has('a'))
    // set is a witnessed effect function over tables where its key is absent.
    const absentDomain = numTables().filter((t) => !t.has('a'))
    assert.ok(isWitnessed(setEffect('a', 0, numDef), absentDomain, (x, y) => x.eq(y)))
  })

  it('satisfaction (formula 24) and notify (Definition 26) classify transitions', () => {
    const spec = new Set(['a', 'b'])
    const sigma0 = CoeffectTable.empty()
    const sigmaA = sigma0.withEntry('a', entry(0, numDef))
    const sigmaAB = sigmaA.withEntry('b', entry(1, numDef))
    assert.ok(!sigma0.satisfies(spec))
    assert.ok(!sigmaA.satisfies(spec))
    assert.ok(sigmaAB.satisfies(spec))
    assert.equal(notify(spec, sigma0, sigmaA), 'neutral')
    assert.equal(notify(spec, sigmaA, sigmaAB), 'activating')
    assert.equal(notify(spec, sigmaAB, sigmaA), 'deactivating')
    assert.equal(notify(spec, sigmaA, sigma0), 'neutral')
  })

  it('Definition 24: an operation lift writes only its own key and is witnessed', () => {
    const toggleA = liftOperation('a', 'toggle', undefined)
    const sigma = CoeffectTable.of(new Map([
      ['a', entry(0, numDef)],
      ['b', entry(1, numDef)],
    ]))
    const [next, inverse] = toggleA(sigma)
    assert.equal(next.get('a').value, 1)
    assert.equal(next.get('b').value, 1) // untouched
    assert.equal(inverse(next).get('a').value, 0)
    // The lift is witnessed on tables where both keys are bound.
    const domain = numTables().filter((t) => t.has('a') && t.has('b'))
    assert.ok(isWitnessed(toggleA, domain, (x, y) => x.eq(y)))
    // Its result triple exposes the outcome (formula 23).
    const [delta, inv, outcome] = liftOperationResult('a', 'toggle', undefined)(sigma)
    assert.equal(delta.get('a').value, 1)
    assert.equal(inv(delta).get('a').value, 0)
    assert.equal(outcome, 0)
  })

  it('Theorem 40: operations at distinct keys are independent', () => {
    const toggleA = liftOperation('a', 'toggle', undefined)
    const toggleB = liftOperation('b', 'toggle', undefined)
    const domain = numTables().filter((t) => t.has('a') && t.has('b'))
    assert.ok(independent(toggleA, toggleB, domain, (x, y) => x.eq(y)))
  })

  it('Theorem 42: coeffect-mediated effects over commutative keys are independent; order-sensitive keys are not', () => {
    const toggleA = liftOperationResult('a', 'toggle', undefined)
    const toggleB = liftOperationResult('b', 'toggle', undefined)
    // A mediated effect: toggle a, then continue with the unit regardless of outcome.
    const chainA = mediated(toggleA, () => effectUnit<CoeffectTable>())
    const chainB = mediated(toggleB, () => effectUnit<CoeffectTable>())
    // A two-stage mediated effect over the same (commutative) key.
    const chainA2 = mediated(toggleA, () => mediated(toggleA, () => effectUnit<CoeffectTable>()))
    const domain = numTables().filter((t) => t.has('a') && t.has('b'))
    assert.ok(independent(chainA, chainB, domain, (x, y) => x.eq(y)))
    assert.ok(independent(chainA2, chainA2, domain, (x, y) => x.eq(y)))
    // The push key is order-sensitive: two distinct pushes do not commute.
    const push1: Effect<CoeffectTable> = liftOperation('l', 'push', 1)
    const push2: Effect<CoeffectTable> = liftOperation('l', 'push', 2)
    const listDomain = listTables().filter((t) => t.has('l'))
    assert.ok(!independent(push1, push2, listDomain, (x, y) => x.eq(y)))
  })

  it('Definitions 28-29: isolation routes get/set through realms; isolate is derived', () => {
    let ctx = emptyIso()
    assert.equal(realmOf(ctx, 'log'), 'log')
    // set binds at the resolved realm.
    const [, unset] = isoSet('log', 'A', numDef)(ctx)
    ctx = isoSet('log', 'A', numDef)(ctx)[0]
    assert.equal(isoGet(ctx, 'log').value, 'A')
    // isolate(k, r) is a derived map: the table is shared, the realm rebinds.
    const isolated = isolate(ctx, 'log', 'r1')
    assert.equal(realmOf(isolated, 'log'), 'r1')
    assert.throws(() => isoGet(isolated, 'log'), PreconditionError) // r1 unbound in σ
    assert.equal(isoGet(ctx, 'log').value, 'A') // original unchanged
    // set now binds at realm r1; the same key binds different values per context.
    const child = isoSet('log', 'B', numDef)(isolated)[0]
    assert.equal(isoGet(child, 'log').value, 'B')
    assert.equal(isoGet(ctx, 'log').value, 'A')
    // Reassigning an isolated key is allowed (not refused).
    const reassigned = isolate(isolated, 'log', 'r2')
    assert.equal(realmOf(reassigned, 'log'), 'r2')
    void unset
  })

  it('Definitions 30-31: interception merges metadata right-biased; intercept is derived', () => {
    let ctx = emptyInter()
    const monoid = {
      empty: {},
      merge: (left: unknown, right: unknown) => ({ ...(left as object), ...(right as object) }),
    }
    ctx = interSet('fetch', monoid, (meta) => `fetch(${(meta as { timeout: number }).timeout})`)(ctx)[0]
    assert.equal(interGet(ctx, 'fetch', { timeout: 100 }), 'fetch(100)')
    // intercept merges context metadata: ι wins over the declaration (right-biased).
    const constrained = intercept(ctx, 'fetch', { timeout: 5 })
    assert.equal(interGet(constrained, 'fetch', { timeout: 100 }), 'fetch(5)')
    // The original context keeps its own metadata — derived realization.
    assert.equal(interGet(ctx, 'fetch', { timeout: 100 }), 'fetch(100)')
    // Interception accumulates: ν merges onto what is already there.
    const tightened = intercept(constrained, 'fetch', { timeout: 1 })
    assert.equal(interGet(tightened, 'fetch', { timeout: 100 }), 'fetch(1)')
    assert.throws(() => interSet('fetch', monoid, (m) => m)(tightened), PreconditionError)
  })
})
