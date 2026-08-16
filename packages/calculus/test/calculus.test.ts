/**
 * Section 4 executable checks: each test drives the ten-rule machine and
 * asserts the paper's metatheorems — Preservation (Thm 59), Recovery exactness
 * (Thm 61 / Cor 62), Ordering (Thm 63), Progress (Thm 66), Confluence (Thm 73)
 * — plus the failure, registration, and vestigial-entry machinery of 4.3.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  acyclic,
  applicable,
  applyLifecycle,
  approxEq,
  emptyMachine,
  freshName,
  insert,
  installed,
  providerOf,
  quiet,
  quasiEq,
  relied,
  remove,
  retire,
  setSigma,
  sigmaOf,
  supportSet,
  target,
  wellFormed,
  type Component,
  type EffectIter,
  type Machine,
  type Name,
  type RegistryState,
  type Step,
} from '../src/calculus.ts'
import { identity } from '../src/core.ts'
import { mulberry32 } from './helpers.ts'

// ---------------------------------------------------------------------------
// A component DSL for the tests.

/** A provider: activates by installing one key, inverse deletes it. */
const provision = (key: string, value: unknown, deps: readonly string[] = []): Component => ({
  d: new Set(deps),
  p: new Set([key]),
  e: (gamma, self) => ({
    delta: setSigma(gamma, self, key, value),
    inverse: (s) => setSigma(s, self, key, undefined),
    next: null,
  }),
})

/** A consumer: reads its declared key from the derived context, records it. */
const consume = (key: string, log: { last: unknown }): Component => ({
  d: new Set([key]),
  p: new Set(),
  e: (gamma) => {
    log.last = sigmaOf(gamma).get(key)
    return { delta: gamma, inverse: identity(), next: null }
  },
})

/** A multi-stage provider: installs each key in its own iteration (K = stages). */
const staged = (stages: readonly (readonly [string, unknown])[]): EffectIter =>
  (gamma, self) => {
    const [[key, value], ...rest] = stages
    const delta = setSigma(gamma, self, key!, value)
    return {
      delta,
      inverse: (s) => setSigma(s, self, key!, undefined),
      next: rest.length === 0 ? null : staged(rest),
    }
  }

const stagedComponent = (stages: readonly (readonly [string, unknown])[], deps: readonly string[] = []): Component => ({
  d: new Set(deps),
  p: new Set(stages.map(([k]) => k)),
  e: staged(stages),
})

/** A component whose first iteration registers a child (Definition 47). */
const registerer = (child: Component): Component => ({
  d: new Set(),
  p: new Set(),
  e: (gamma) => ({ delta: gamma, inverse: identity(), next: null, registrations: [{ component: child }] }),
})

/** A component whose activation raises. */
const failer = (message: string): Component => ({
  d: new Set(),
  p: new Set(),
  e: () => {
    throw new Error(message)
  },
})

const force = (state: RegistryState, rule: Step['rule'], name: Name): RegistryState =>
  applyLifecycle(state, { rule, name })

const viewKey = (view: ReturnType<typeof target>): string =>
  view === null ? '⊥' : JSON.stringify([...view.entries()].sort())

/** Drive one fiber through its whole activation to Active. */
const activate = (state: RegistryState, name: Name): RegistryState => {
  let s = force(state, 'L-Begin', name)
  // One-iteration effects pass straight through Reloading via L-Finish; the
  // staged one needs its iterations.
  for (let guard = 0; guard < 100; guard++) {
    const next = applicable(s).find((step) => step.name === name && (step.rule === 'L-Iter' || step.rule === 'L-Finish'))
    if (next === undefined) throw new Error(`activation of ${name} stalled at ${JSON.stringify(s.fibers.get(name)!.theta)}`)
    s = applyLifecycle(s, next)
    if (next.rule === 'L-Finish') return s
  }
  throw new Error('activation did not finish')
}

/** Drive one fiber from Active to Inactive (its target already turned). */
const deactivate = (state: RegistryState, name: Name): RegistryState => {
  let s = force(state, 'L-Leave', name)
  assert.ok(applicable(s).some((step) => step.rule === 'L-Unload' && step.name === name))
  return force(s, 'L-Unload', name)
}

describe('4.2/4.3 the calculus machine', () => {
  it('the base lifecycle: Inactive → Active → Unloading → Inactive, with O-Remove', () => {
    const m = insert(emptyMachine(), provision('k', 'v'))
    const pName = [...m.gamma.fibers.keys()][0]!
    assert.ok(applicable(m.gamma).some((s) => s.rule === 'L-Begin' && s.name === pName))
    let s = force(m.gamma, 'L-Begin', pName)
    assert.equal(s.fibers.get(pName)!.theta.kind, 'Reloading')
    s = force(s, 'L-Finish', pName)
    assert.equal(s.fibers.get(pName)!.theta.kind, 'Active')
    assert.equal(sigmaOf(s).get('k'), 'v')
    assert.ok(quiet(s))
    // Retirement is a request: it only turns the target.
    s = retire(s, pName)
    assert.equal(target(s, pName), null)
    assert.ok(!quiet(s))
    s = deactivate(s, pName)
    assert.equal(s.fibers.get(pName)!.theta.kind, 'Inactive')
    assert.equal(sigmaOf(s).has('k'), false)
    assert.ok(quiet(s))
    // Vestigial entry: removal requires τ=⊤, Inactive, and no children.
    const removed = remove(s, pName)
    assert.ok(removed !== null && removed.fibers.size === 0)
  })

  it('Theorem 63 (Ordering): consumers activate after providers and withdraw before providers', () => {
    const log = { last: undefined }
    let m = insert(emptyMachine(), provision('k', 'v'))
    m = insert(m, consume('k', log))
    const names = [...m.gamma.fibers.keys()]
    const pName = names[0]!
    const cName = names[1]!
    // The consumer cannot begin before k is provided.
    assert.ok(!applicable(m.gamma).some((s) => s.rule === 'L-Begin' && s.name === cName))
    let s = activate(m.gamma, pName)
    assert.ok(applicable(s).some((st) => st.rule === 'L-Begin' && st.name === cName))
    s = activate(s, cName)
    assert.equal(log.last, 'v')
    const cTheta = s.fibers.get(cName)!.theta
    assert.ok(cTheta.kind === 'Active')
    assert.equal(cTheta.omega.get('k'), pName) // the committed view names the provider
    // Retire the provider: both must leave, but the provider's withdrawal is
    // guarded until the consumer has deactivated.
    s = retire(s, pName)
    s = force(s, 'L-Leave', pName)
    assert.ok(relied(s, pName))
    assert.ok(!applicable(s).some((st) => st.rule === 'L-Unload' && st.name === pName))
    assert.ok(applicable(s).some((st) => st.rule === 'L-Leave' && st.name === cName))
    s = deactivate(s, cName)
    assert.ok(!relied(s, pName))
    s = force(s, 'L-Unload', pName)
    assert.equal(s.fibers.get(pName)!.theta.kind, 'Inactive')
    assert.equal(s.fibers.get(cName)!.theta.kind, 'Inactive')
    assert.ok(quiet(s))
  })

  it('Theorem 59 (Preservation): well-formedness holds under arbitrary schedules', () => {
    const random = mulberry32(0x59be)
    const pool: readonly Component[] = [
      provision('k1', 1),
      provision('k2', 2),
      provision('k3', 3),
      consume('k1', { last: undefined }),
      consume('k1', { last: undefined }),
      consume('k3', { last: undefined }),
    ]
    let m = emptyMachine()
    for (const component of pool) m = insert(m, component)
    const names = [...m.gamma.fibers.keys()]
    let s = m.gamma
    assert.ok(acyclic(s))
    for (let step = 0; step < 300; step++) {
      assert.ok(wellFormed(s), `well-formedness broke at step ${step}`)
      const options = applicable(s)
      if (options.length === 0) break
      const chosen = options[Math.floor(random() * options.length)]!
      s = applyLifecycle(s, chosen)
      // Occasionally retire a random fiber (an orchestration input).
      if (random() < 0.05) {
        s = retire(s, names[Math.floor(random() * names.length)]!)
      }
    }
    // Drive to quiescence.
    for (let guard = 0; guard < 2000 && !quiet(s); guard++) {
      const options = applicable(s)
      if (options.length === 0) break
      s = applyLifecycle(s, options[Math.floor(random() * options.length)]!)
      assert.ok(wellFormed(s))
    }
    assert.ok(quiet(s))
  })

  it('Theorem 66 (Progress): random schedules terminate quiescent and respect the step bound', () => {
    const random = mulberry32(0x66c)
    for (let trial = 0; trial < 40; trial++) {
      let m = emptyMachine()
      const pool: readonly Component[] = [
        provision('a', 1),
        provision('b', 2),
        consume('a', { last: undefined }),
        consume('a', { last: undefined }),
        consume('b', { last: undefined }),
      ]
      for (const component of pool) m = insert(m, component)
      const names = [...m.gamma.fibers.keys()]
      let s = m.gamma
      const steps = new Map<Name, number>(names.map((n) => [n, 0]))
      const turns = new Map<Name, number>(names.map((n) => [n, 0]))
      let budget = 4000
      while (budget-- > 0 && !quiet(s)) {
        // Random orchestration input: occasionally retire one fiber.
        if (random() < 0.03) s = retire(s, names[Math.floor(random() * names.length)]!)
        const options = applicable(s)
        if (options.length === 0) {
          assert.ok(quiet(s), `deadlock without quiescence (trial ${trial})`)
          break
        }
        const chosen = options[Math.floor(random() * options.length)]!
        const before = viewKey(target(s, chosen.name))
        s = applyLifecycle(s, chosen)
        const after = viewKey(target(s, chosen.name))
        steps.set(chosen.name, (steps.get(chosen.name) ?? 0) + 1)
        if (before !== after) turns.set(chosen.name, (turns.get(chosen.name) ?? 0) + 1)
        assert.ok(wellFormed(s))
      }
      assert.ok(quiet(s), `did not quiesce (trial ${trial})`)
      // S(n) ≤ (K+4)(V(n)+1) with K = 1 for these single-iteration effects.
      for (const n of names) {
        const S = steps.get(n) ?? 0
        const V = turns.get(n) ?? 0
        assert.ok(S <= 5 * (V + 1), `bound violated for ${n}: S=${S} V=${V}`)
      }
    }
  })

  it('Corollary 62 (Terminal recovery): withdrawing a component leaves the state it never touched', () => {
    let m = insert(emptyMachine(), stagedComponent([['a', 1], ['b', 2], ['c', 3]]))
    m = insert(m, provision('x', 10))
    const names = [...m.gamma.fibers.keys()]
    const nName = names[0]!
    const wName = names[1]!
    let s = m.gamma
    const baseline = s // γ^b: before n began
    s = force(s, 'L-Begin', nName)
    s = force(s, 'L-Iter', nName) // a installed
    s = activate(s, wName) // independent fiber runs while n is Reloading
    s = force(s, 'L-Iter', nName) // b installed
    s = force(s, 'L-Finish', nName) // c installed; n Active
    assert.equal(sigmaOf(s).size, 4)
    s = retire(s, nName)
    s = deactivate(s, nName)
    // The state with n never loaded: run only w's steps from the baseline,
    // then withdraw n's own (never-activated) entry entirely.
    let wOnly = activate(baseline, wName)
    wOnly = remove(retire(wOnly, nName), nName)!
    assert.ok(approxEq(s, wOnly), 'state after withdrawal ≈ state with n never loaded')
    assert.ok(quiet(s) && quiet(wOnly))
  })

  it('4.3.4 Failure: a raise routes through Unloading and installs nothing', () => {
    let m = insert(emptyMachine(), failer('boom'))
    m = insert(m, provision('k', 7))
    const names = [...m.gamma.fibers.keys()]
    const fName = names[0]!
    const sName = names[1]!
    let s = force(m.gamma, 'L-Begin', fName)
    const options = applicable(s).filter((st) => st.name === fName)
    assert.ok(options.some((st) => st.rule === 'L-Raise'))
    assert.ok(!options.some((st) => st.rule === 'L-Iter' || st.rule === 'L-Finish'))
    s = force(s, 'L-Raise', fName)
    assert.equal(s.fibers.get(fName)!.theta.kind, 'Unloading')
    s = force(s, 'L-Unload', fName)
    const theta = s.fibers.get(fName)!.theta
    assert.equal(theta.kind, 'Inactive')
    assert.ok(theta.kind === 'Inactive' && theta.outcome instanceof Error)
    // A failed fiber never re-enters (L-Begin requires outcome ⊥) and the
    // sibling runs unaffected.
    assert.ok(!applicable(s).some((st) => st.rule === 'L-Begin' && st.name === fName))
    s = activate(s, sName)
    assert.equal(sigmaOf(s).get('k'), 7)
    assert.ok(quiet(s))
  })

  it('Definition 47 (Registration): the inverse of O-Insert(π=n) is O-Retire, applied on unload', () => {
    let m = insert(emptyMachine(), registerer(provision('k', 'child')))
    const names = [...m.gamma.fibers.keys()]
    const rName = names[0]!
    let s = activate(m.gamma, rName)
    const children = [...s.fibers.values()].filter((f) => f.parent === rName)
    assert.equal(children.length, 1)
    const cName = children[0]!.name
    assert.equal(s.fibers.get(cName)!.theta.kind, 'Inactive')
    s = activate(s, cName)
    assert.equal(sigmaOf(s).get('k'), 'child')
    // Retiring the parent retires the registered child on unload.
    s = retire(s, rName)
    s = deactivate(s, rName)
    assert.ok(s.fibers.get(cName)!.retired)
    s = deactivate(s, cName)
    // O-Remove: children before parents.
    assert.ok(remove(s, rName) === null)
    const withoutChild = remove(s, cName)!
    const withoutParent = remove(withoutChild, rName)!
    assert.equal(withoutParent.fibers.size, 0)
  })

  it('Theorem 73 (Confluence) + Lemma 70: schedules reach the same quiescent state', () => {
    const build = (): Machine => {
      let m = emptyMachine()
      for (const component of [provision('k', 'v1'), provision('j', 'v2'), consume('k', { last: undefined }), consume('j', { last: undefined })]) {
        m = insert(m, component)
      }
      return m
    }
    const random = mulberry32(0x73d)
    const a = build()
    const b = build()
    // Schedule A: deterministic, fiber-by-fiber.
    let sa = a.gamma
    for (const name of [...a.gamma.fibers.keys()]) sa = activate(sa, name)
    // Schedule B: random interleaving to quiescence.
    let sb = b.gamma
    for (let guard = 0; guard < 2000 && !quiet(sb); guard++) {
      const options = applicable(sb)
      if (options.length === 0) break
      sb = applyLifecycle(sb, options[Math.floor(random() * options.length)]!)
    }
    assert.ok(quiet(sa) && quiet(sb))
    // Confluence (Theorem 73): the two schedules agree up to ≃ on tables and
    // control fields. Accumulator closures differ by construction (each run
    // folds its own inverses), so the relation compares ω, τ, π, and θ.kind —
    // the control fields the paper's ≃ ranges over — rather than closures.
    const confluentEq = (x: RegistryState, y: RegistryState): boolean => {
      if (!approxEq(x, y)) return false
      if (x.fibers.size !== y.fibers.size) return false
      for (const [name, fx] of x.fibers) {
        const fy = y.fibers.get(name)
        if (fy === undefined) return false
        if (fx.parent !== fy.parent || fx.retired !== fy.retired) return false
        if (fx.theta.kind !== fy.theta.kind) return false
        if (fx.theta.kind !== 'Inactive' && fy.theta.kind !== 'Inactive') {
          if (JSON.stringify([...fx.theta.omega].sort()) !== JSON.stringify([...fy.theta.omega].sort())) return false
        }
      }
      return true
    }
    assert.ok(confluentEq(sa, sb))
    // Lemma 70: at quiescence the support set is exactly the active fibers.
    const active = [...sa.fibers.values()].filter((f) => f.theta.kind === 'Active').map((f) => f.name).sort()
    assert.deepEqual([...supportSet(sa)].sort(), active)
    assert.deepEqual([...sigmaOf(sa).values()].sort(), ['v1', 'v2'])
  })

  it('≈ ignores control fields; ≃ does not (Definition 53)', () => {
    const m = insert(emptyMachine(), provision('k', 'v'))
    const name = [...m.gamma.fibers.keys()][0]!
    const plain = m.gamma
    const retired = retire(plain, name)
    assert.ok(approxEq(plain, retired))
    assert.ok(!quasiEq(plain, retired))
    // A vestigial entry (Lemma 57) is ≈-equal to its own removal.
    let s = activate(plain, name)
    s = retire(s, name)
    s = deactivate(s, name)
    const removed = remove(s, name)!
    assert.ok(approxEq(s, removed))
    assert.ok(!quasiEq(s, removed))
    void installed
    void providerOf
    void freshName
  })
})
