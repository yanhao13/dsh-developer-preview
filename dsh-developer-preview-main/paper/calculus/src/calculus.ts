/**
 * Section 4: a calculus of dynamic composition — an executable encoding of the
 * paper's ten-rule machine. Components are triples (d, p, e) of a coeffect
 * specification, a provision, and a witnessed effect iterator; fibers carry
 * the extended lifecycle states of Definition 49; every rule is a pure
 * function from one registry state to the next, exactly as in the paper.
 *
 * The machine is deliberately nondeterministic (a state admits several
 * applicable lifecycle rules), so the metatheorems — Preservation (Theorem
 * 59), Recovery exactness (Theorem 61 / Corollary 62), Ordering (Theorem 63),
 * Progress (Theorem 66), Confluence (Theorem 73) — become executable checks
 * over arbitrary schedules, exactly as the paper intends.
 */
import { compose, identity, type ContextTransform } from './core.ts'
import { type Key } from './coeffects.ts'

/** A fiber name: an atom, compared by equality only (Definition 45). */
export type Name = string

/** A committed view: declared key → providing fiber name (Definition 44). */
export type CommittedView = ReadonlyMap<Key, Name>

/** The paper's outcome ζ: ⊥, or an error from Ξ. */
export type Outcome = null | unknown

/** The extended lifecycle state space (Definition 49). */
export type LifecycleState =
  | { readonly kind: 'Inactive'; readonly outcome: Outcome }
  | { readonly kind: 'Reloading'; readonly iter: EffectIter; readonly g: StateTransform; readonly omega: CommittedView }
  | { readonly kind: 'Active'; readonly g: StateTransform; readonly omega: CommittedView }
  | { readonly kind: 'Unloading'; readonly g: StateTransform; readonly omega: CommittedView; readonly outcome: Outcome }

/** A component over the calculus state (Definition 43): (d, p, e). */
export interface Component {
  /** The coeffect specification: what the component reads. */
  readonly d: ReadonlySet<Key>
  /** The provision: keys the component may provide; no key outside p is written. */
  readonly p: ReadonlySet<Key>
  /** The witnessed effect iterator (Definition 51, failing form of 4.3.4). */
  readonly e: EffectIter
}

/** One iteration result (Definition 51): (δ, g, o), plus registrations (Def. 47). */
export interface IterResult {
  readonly delta: RegistryState
  readonly inverse: StateTransform
  readonly next: EffectIter | null
  /** Components this iteration registers; the machine draws fresh names with π = self. */
  readonly registrations?: readonly { readonly component: Component }[]
}

/**
 * The effect iterator 𝔈^{fail}_Γ (Definitions 51 and 4.3.4): applied to a state
 * it yields (δ, g, Just/`next` | Nothing), or throws to raise ξ (𝔏𝔢𝔣𝔱).
 */
export type EffectIter = (gamma: RegistryState, self: Name) => IterResult

/** A state map on the registry: Γ → Γ. */
export type StateTransform = ContextTransform<RegistryState>

/** A fiber (Definition 44): ⟨d, p, e, π, σ, τ, θ⟩. */
export interface Fiber {
  readonly name: Name
  readonly component: Component
  /** The parent: a fiber name, or the root marker. */
  readonly parent: Name | 'root'
  /** The fiber's own coeffect table (Definition 44). */
  readonly sigma: ReadonlyMap<Key, unknown>
  /** The retirement flag τ. */
  readonly retired: boolean
  /** The lifecycle state θ. */
  readonly theta: LifecycleState
}

/** The registry state γ: the fiber registry plus the ambient state (Definition 45). */
export interface RegistryState {
  readonly fibers: ReadonlyMap<Name, Fiber>
  /** Whatever else in Γ no fiber's table names. */
  readonly ambient: ReadonlyMap<string, unknown>
  /**
   * Bookkeeping for Definition 47: the fibers each name has registered; the
   * inverse of that registration (O-Retire) is applied when the registering
   * fiber unloads. Not part of the paper's state — the paper folds it into g.
   */
  readonly registrations: ReadonlyMap<Name, readonly Name[]>
}

/** The machine: a registry state plus the fresh-name supply. */
export interface Machine {
  readonly gamma: RegistryState
  readonly nextName: number
}

export const emptyMachine = (): Machine => ({
  gamma: { fibers: new Map(), ambient: new Map(), registrations: new Map() },
  nextName: 0,
})

// ---------------------------------------------------------------------------
// Derived quantities (Definitions 40-46)

/** The derived coeffect context σ_γ: the union of ACTIVE fibers' tables (Eq. 40). */
export const sigmaOf = (gamma: RegistryState): ReadonlyMap<Key, unknown> => {
  const merged = new Map<Key, unknown>()
  for (const fiber of gamma.fibers.values()) {
    if (fiber.theta.kind === 'Active') {
      for (const [k, v] of fiber.sigma) merged.set(k, v)
    }
  }
  return merged
}

/** provider_k(γ): the unique Active fiber that installed k. */
export const providerOf = (gamma: RegistryState, key: Key): Name | undefined => {
  for (const fiber of gamma.fibers.values()) {
    if (fiber.theta.kind === 'Active' && fiber.sigma.has(key)) return fiber.name
  }
  return undefined
}

/** γ ⊧ d: every declared key has an Active provider (Definition 46). */
export const satisfies = (gamma: RegistryState, d: ReadonlySet<Key>): boolean => {
  for (const key of d) if (providerOf(gamma, key) === undefined) return false
  return true
}

/** target_n(γ): ⊥ when retired or unsatisfied, else the provider map (Eq. 41). */
export const target = (gamma: RegistryState, n: Name): null | CommittedView => {
  const fiber = gamma.fibers.get(n)
  if (fiber === undefined) return null
  if (fiber.retired || !satisfies(gamma, fiber.component.d)) return null
  const view = new Map<Key, Name>()
  for (const key of fiber.component.d) {
    const provider = providerOf(gamma, key)
    if (provider === undefined) return null
    view.set(key, provider)
  }
  return view
}

/** installed_n(γ): θ_n ≠ Inactive(−) (Eq. 44). */
export const installed = (gamma: RegistryState, n: Name): boolean => {
  const fiber = gamma.fibers.get(n)
  return fiber !== undefined && fiber.theta.kind !== 'Inactive'
}

/** relied_n(γ): some other installed fiber resolves a key to n (Eq. 46). */
export const relied = (gamma: RegistryState, n: Name): boolean => {
  for (const m of gamma.fibers.values()) {
    if (m.name === n || !installed(gamma, m.name)) continue
    const omega = m.theta.kind === 'Inactive' ? null : m.theta.omega
    if (omega === null) continue
    for (const [, provider] of omega) if (provider === n) return true
  }
  return false
}

const viewEq = (a: null | CommittedView, b: null | CommittedView): boolean => {
  if (a === null || b === null) return a === b
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

/** quiet(γ): every fiber has reached its target (Definition 46, wide Eq. 45). */
export const quiet = (gamma: RegistryState): boolean => {
  for (const fiber of gamma.fibers.values()) {
    const t = target(gamma, fiber.name)
    switch (fiber.theta.kind) {
      case 'Inactive':
        if (fiber.theta.outcome === null && t !== null) return false
        break
      case 'Active':
        if (!viewEq(t, fiber.theta.omega)) return false
        break
      case 'Reloading':
      case 'Unloading':
        return false
    }
  }
  return true
}

/** Well-formedness (Definition 58). */
export const wellFormed = (gamma: RegistryState): boolean => {
  for (const m of gamma.fibers.values()) {
    if (m.parent !== 'root' && !gamma.fibers.has(m.parent)) return false
    for (const n of gamma.fibers.values()) {
      if (m.name !== n.name && [...m.component.p].some((k) => n.component.p.has(k))) return false
    }
    if (installed(gamma, m.name)) {
      if (m.theta.kind === 'Inactive') return false
      for (const key of m.component.d) {
        const provider = m.theta.omega.get(key)
        if (provider === undefined) return false
        if (!gamma.fibers.has(provider)) return false
        if (!installed(gamma, provider)) return false
      }
    }
  }
  return true
}

/** The precedence relation n ≺ m ⟺ p_n ∩ d_m ≠ ∅ (Definition 65). */
export const precedes = (gamma: RegistryState, n: Name, m: Name): boolean => {
  const fn = gamma.fibers.get(n)
  const fm = gamma.fibers.get(m)
  if (fn === undefined || fm === undefined) return false
  return [...fn.component.p].some((k) => fm.component.d.has(k))
}

/** Whether ≺ is acyclic. */
export const acyclic = (gamma: RegistryState): boolean => {
  const names = [...gamma.fibers.keys()]
  const edges = new Map<Name, Name[]>()
  for (const n of names) {
    edges.set(n, names.filter((m) => precedes(gamma, n, m)))
  }
  const state = new Map<Name, 0 | 1 | 2>(names.map((n) => [n, 0]))
  const visit = (n: Name): boolean => {
    const s = state.get(n)!
    if (s === 2) return true
    if (s === 1) return false
    state.set(n, 1)
    for (const m of edges.get(n)!) if (!visit(m)) return false
    state.set(n, 2)
    return true
  }
  return names.every(visit)
}

/** The support set A (Definition 67): the least fixed point of Eq. 63. */
export const supportSet = (gamma: RegistryState): Set<Name> => {
  let current = new Set<Name>()
  let changed = true
  while (changed) {
    changed = false
    for (const fiber of gamma.fibers.values()) {
      if (current.has(fiber.name) || fiber.retired) continue
      const parentOk = fiber.parent === 'root' || current.has(fiber.parent)
      const depsOk = [...fiber.component.d].every((k) =>
        [...gamma.fibers.values()].some((m) => current.has(m.name) && m.component.p.has(k)),
      )
      if (parentOk && depsOk) {
        current.add(fiber.name)
        changed = true
      }
    }
  }
  return current
}

// ---------------------------------------------------------------------------
// The ten rules. Each returns the successor state, or null when the premises
// fail. Lifecycle rules enumerate every (rule, name) pair whose premises hold.

const withFiber = (gamma: RegistryState, name: Name, update: (f: Fiber) => Fiber): RegistryState => {
  const fibers = new Map(gamma.fibers)
  const fiber = fibers.get(name)
  if (fiber === undefined) return gamma
  fibers.set(name, update(fiber))
  return { ...gamma, fibers }
}

/**
 * Update one fiber's own coeffect table — the primitive effect authors use to
 * write a provision (confined writes land here; Definition 48).
 */
export const setSigma = (gamma: RegistryState, name: Name, key: Key, value: unknown): RegistryState =>
  withFiber(gamma, name, (f) => {
    const sigma = new Map(f.sigma)
    if (value === undefined) sigma.delete(key)
    else sigma.set(key, value)
    return { ...f, sigma }
  })

/** O-Insert: the only external input besides O-Retire. Returns the new machine. */
export const insert = (machine: Machine, component: Component, parent: Name | 'root' = 'root'): Machine => {
  const { gamma, nextName } = machine
  if (parent !== 'root' && !gamma.fibers.has(parent)) throw new Error('insert: parent not in registry')
  for (const m of gamma.fibers.values()) {
    if ([...component.p].some((k) => m.component.p.has(k))) {
      throw new Error('insert: provision overlaps an existing fiber')
    }
  }
  const name = `f${nextName}`
  const fiber: Fiber = {
    name,
    component,
    parent,
    sigma: new Map(),
    retired: false,
    theta: { kind: 'Inactive', outcome: null },
  }
  return {
    gamma: { ...gamma, fibers: new Map(gamma.fibers).set(name, fiber) },
    nextName: nextName + 1,
  }
}

/** O-Retire: unconditional on the fiber's state (a request). */
export const retire = (gamma: RegistryState, name: Name): RegistryState =>
  withFiber(gamma, name, (f) => ({ ...f, retired: true }))

/** O-Remove: τ=⊤, Inactive, and no child names it. Null when illegal. */
export const remove = (gamma: RegistryState, name: Name): RegistryState | null => {
  const fiber = gamma.fibers.get(name)
  if (fiber === undefined || !fiber.retired || fiber.theta.kind !== 'Inactive') return null
  for (const m of gamma.fibers.values()) if (m.parent === name) return null
  const fibers = new Map(gamma.fibers)
  fibers.delete(name)
  return { ...gamma, fibers }
}

/** One applicable lifecycle step: the rule plus the fiber it acts on. */
export interface Step {
  readonly rule: 'L-Begin' | 'L-Iter' | 'L-Finish' | 'L-Divert-abort' | 'L-Divert-land' | 'L-Raise' | 'L-Leave' | 'L-Unload'
  readonly name: Name
}

/** All lifecycle rules whose premises hold at γ — the nondeterministic choice set. */
export const applicable = (gamma: RegistryState): readonly Step[] => {
  const steps: Step[] = []
  for (const fiber of gamma.fibers.values()) {
    const n = fiber.name
    const t = target(gamma, n)
    switch (fiber.theta.kind) {
      case 'Inactive':
        if (fiber.theta.outcome === null && t !== null) steps.push({ rule: 'L-Begin', name: n })
        break
      case 'Reloading': {
        const theta = fiber.theta
        if (!viewEq(t, theta.omega)) {
          steps.push({ rule: 'L-Divert-abort', name: n })
          // The landing alternative needs the iteration to be applicable.
          let ok = true
          try {
            theta.iter(gamma, n)
          } catch {
            ok = false
          }
          if (ok) steps.push({ rule: 'L-Divert-land', name: n })
          break
        }
        try {
          const result = theta.iter(gamma, n)
          steps.push(result.next === null ? { rule: 'L-Finish', name: n } : { rule: 'L-Iter', name: n })
        } catch {
          steps.push({ rule: 'L-Raise', name: n })
        }
        break
      }
      case 'Active':
        if (!viewEq(t, fiber.theta.omega)) steps.push({ rule: 'L-Leave', name: n })
        break
      case 'Unloading':
        if (!relied(gamma, n)) steps.push({ rule: 'L-Unload', name: n })
        break
    }
  }
  return steps
}

/** The state map Ψ of a step (Eq. 51), null when the iteration must not run. */
const stateMapOf = (gamma: RegistryState, step: Step): StateTransform | null => {
  const fiber = gamma.fibers.get(step.name)!
  switch (step.rule) {
    case 'L-Iter':
    case 'L-Finish':
    case 'L-Divert-land': {
      const result = fiber.theta.kind === 'Reloading' ? fiber.theta.iter(gamma, step.name) : null
      return result === null ? null : (s) => result.delta
    }
    case 'L-Unload':
      return fiber.theta.kind === 'Unloading' ? fiber.theta.g : identity()
    default:
      return identity()
  }
}

/** Apply one lifecycle step; throws when the premises no longer hold. */
export const applyLifecycle = (gamma: RegistryState, step: Step): RegistryState => {
  const fiber = gamma.fibers.get(step.name)
  if (fiber === undefined) throw new Error(`applyLifecycle: unknown fiber ${step.name}`)
  let state: RegistryState = gamma
  const t = target(gamma, step.name)

  switch (step.rule) {
    case 'L-Begin': {
      if (fiber.theta.kind !== 'Inactive' || fiber.theta.outcome !== null || t === null) {
        throw new Error('L-Begin premises failed')
      }
      return withFiber(gamma, step.name, (f) => ({
        ...f,
        theta: { kind: 'Reloading', iter: f.component.e, g: identity(), omega: t },
      }))
    }
    case 'L-Iter':
    case 'L-Finish': {
      if (fiber.theta.kind !== 'Reloading' || !viewEq(t, fiber.theta.omega)) {
        throw new Error(`${step.rule} premises failed`)
      }
      const theta = fiber.theta
      const result = theta.iter(gamma, step.name)
      state = installRegistrations(result.delta, step.name, result.registrations ?? [])
      const g = compose(theta.g, result.inverse)
      return withFiber(state, step.name, (f) => ({
        ...f,
        theta: result.next === null
          ? { kind: 'Active', g, omega: theta.omega }
          : { kind: 'Reloading', iter: result.next, g, omega: theta.omega },
      }))
    }
    case 'L-Divert-abort':
    case 'L-Divert-land': {
      if (fiber.theta.kind !== 'Reloading' || viewEq(t, fiber.theta.omega)) {
        throw new Error(`${step.rule} premises failed`)
      }
      const theta = fiber.theta
      let delta = gamma
      let h: StateTransform = identity()
      if (step.rule === 'L-Divert-land') {
        const result = theta.iter(gamma, step.name)
        delta = result.delta
        h = result.inverse
        state = installRegistrations(delta, step.name, result.registrations ?? [])
      }
      return withFiber(state, step.name, (f) => ({
        ...f,
        theta: { kind: 'Unloading', g: compose(theta.g, h), omega: theta.omega, outcome: null },
      }))
    }
    case 'L-Raise': {
      if (fiber.theta.kind !== 'Reloading') throw new Error('L-Raise premises failed')
      const theta = fiber.theta
      let outcome: Outcome = null
      try {
        theta.iter(gamma, step.name)
        throw new Error('L-Raise premises failed: iteration did not raise')
      } catch (xi) {
        outcome = xi
      }
      return withFiber(gamma, step.name, (f) => ({
        ...f,
        theta: { kind: 'Unloading', g: theta.g, omega: theta.omega, outcome },
      }))
    }
    case 'L-Leave': {
      if (fiber.theta.kind !== 'Active' || viewEq(t, fiber.theta.omega)) throw new Error('L-Leave premises failed')
      const theta = fiber.theta
      return withFiber(gamma, step.name, (f) => ({
        ...f,
        theta: { kind: 'Unloading', g: theta.g, omega: theta.omega, outcome: null },
      }))
    }
    case 'L-Unload': {
      if (fiber.theta.kind !== 'Unloading' || relied(gamma, step.name)) throw new Error('L-Unload premises failed')
      const theta = fiber.theta
      const next = theta.g(gamma)
      // Apply the inverses of the registrations this fiber made: O-Retire each.
      let after = next
      for (const registered of gamma.registrations.get(step.name) ?? []) {
        after = retire(after, registered)
      }
      return withFiber(after, step.name, (f) => ({
        ...f,
        theta: { kind: 'Inactive', outcome: theta.outcome },
      }))
    }
  }
}

/** Record and O-Insert the registrations an iteration requested (Definition 47). */
const installRegistrations = (
  gamma: RegistryState,
  parent: Name,
  registrations: readonly { readonly component: Component }[],
): RegistryState => {
  let state = gamma
  const fresh: Name[] = []
  const fibers = new Map(state.fibers)
  for (const { component } of registrations) {
    for (const m of fibers.values()) {
      if ([...component.p].some((k) => m.component.p.has(k))) {
        throw new Error('registration: provision overlaps an existing fiber')
      }
    }
    const name = freshName(state)
    fibers.set(name, {
      name,
      component,
      parent,
      sigma: new Map(),
      retired: false,
      theta: { kind: 'Inactive', outcome: null },
    })
    fresh.push(name)
  }
  state = { ...state, fibers }
  const existing = state.registrations.get(parent) ?? []
  return { ...state, registrations: new Map(state.registrations).set(parent, [...existing, ...fresh]) }
}

let freshCounter = 0
/** Draw a name not already in use (the freshness premise of O-Insert). */
export const freshName = (gamma: RegistryState): Name => {
  let name: Name
  do {
    name = `g${freshCounter++}`
  } while (gamma.fibers.has(name))
  return name
}

// ---------------------------------------------------------------------------
// Equivalences of Section 4.4 (Eq. 52-53).

/**
 * ≈: agreement on everything BUT the control fields — the tables σ_m and the
 * ambient state (Definition 53). dom(F_γ) IS a control field, so a state may
 * relate to one whose registry domain differs; a name present in one state
 * only carries control fields alone and must hold an empty table there (the
 * vestigial-entry case of Lemma 57).
 */
export const approxEq = (a: RegistryState, b: RegistryState): boolean => {
  const names = new Set([...a.fibers.keys(), ...b.fibers.keys()])
  for (const name of names) {
    const fa = a.fibers.get(name)
    const fb = b.fibers.get(name)
    if (fa === undefined || fb === undefined) {
      const only = fa ?? fb!
      if (only.sigma.size !== 0) return false
      continue
    }
    if (fa.sigma.size !== fb.sigma.size) return false
    for (const [k, v] of fa.sigma) if (!fb.sigma.has(k) || fb.sigma.get(k) !== v) return false
  }
  if (a.ambient.size !== b.ambient.size) return false
  for (const [k, v] of a.ambient) if (!b.ambient.has(k) || b.ambient.get(k) !== v) return false
  return true
}

/** ≃ of Eq. 53: ≈ plus registry-domain and control-field agreement. */
export const quasiEq = (a: RegistryState, b: RegistryState): boolean => {
  if (a.fibers.size !== b.fibers.size) return false
  if (!approxEq(a, b)) return false
  for (const [name, fa] of a.fibers) {
    const fb = b.fibers.get(name)
    if (fb === undefined) return false
    if (fa.parent !== fb.parent || fa.retired !== fb.retired) return false
    if (fa.component !== fb.component) return false
    if (!lifecycleEq(fa.theta, fb.theta)) return false
    void name
  }
  return true
}

/** Structural equality of lifecycle states, with functions compared by identity. */
export const lifecycleEq = (a: LifecycleState, b: LifecycleState): boolean => {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'Inactive':
      return a.outcome === (b as typeof a).outcome
    case 'Reloading': {
      const bb = b as typeof a
      return a.iter === bb.iter && a.g === bb.g && viewEq(a.omega, bb.omega)
    }
    case 'Active': {
      const bb = b as typeof a
      return a.g === bb.g && viewEq(a.omega, bb.omega)
    }
    case 'Unloading': {
      const bb = b as typeof a
      return a.g === bb.g && viewEq(a.omega, bb.omega) && a.outcome === bb.outcome
    }
  }
}

export { compose, identity }
