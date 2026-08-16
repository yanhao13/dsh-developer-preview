/**
 * The Cordis-mirroring core: the context Γ∞ (§5.1), coeffect operations
 * (Algorithm 2), reactive notification (Algorithm 3), component instantiation
 * (Algorithm 4), the fiber lifecycle (Algorithm 5), and proxy-mediated
 * context access (Algorithm 6). The backing calculus is Section 4; the
 * correspondence is Table 2 of the paper.
 *
 * Note on set(): Algorithm 2 writes σ[ρ(k)] ← v unconditionally (the mirrored
 * runtime overwrites a binding, like vendor Cordis); the calculus's setEffect
 * enforces Definition 23's no-double-provision precondition.
 */
import {
  composeDisposers,
  execute,
  noop,
  trackEffect,
  type Disposer,
  type EffectCallback,
} from './effects.ts'

/** A coeffect key K: strings and symbols are both admitted. */
export type Key = string | symbol
/** A realm R: symbols, with keys doubling as their own default realm (R ⊇ K). */
export type Realm = string | symbol

const isolateSym: unique symbol = Symbol('ctx.isolate')
const interceptSym: unique symbol = Symbol('ctx.intercept')
const fiberSym: unique symbol = Symbol('ctx.fiber')
const accumulatorSym: unique symbol = Symbol('ctx.accumulator')
const delimitersSym: unique symbol = Symbol('ctx.delimiters')

/** One installed binding: the value and the fiber that installed it. */
interface Binding {
  readonly value: unknown
  readonly provider: Fiber
}

/** Lifecycle state θ (Table 2); FAILED is 𝖨𝗇𝖺𝖼𝗍𝗂𝗏𝖾(ξ). */
export type FiberState = 'INACTIVE' | 'LOADING' | 'ACTIVE' | 'UNLOADING' | 'FAILED'

/** A component ℭ_Γ = 𝔇_Γ × 𝔓_Γ × 𝔈*_Γ (Definition 43). */
export interface Component {
  /** The coeffect specification d: what the component reads. */
  readonly inject: readonly Key[]
  /** The provision p: keys the component may provide. */
  readonly provide: readonly Key[]
  /** The effect function e, bound with the entry's config (Algorithm 4). */
  apply(ctx: Context, config: unknown): EffectCallback
  /** Optional: apply a config change in place (loader per-field dispatch). */
  update?(ctx: Context, next: unknown): void | Promise<void>
}

let uidCounter = 0

/** A fiber ⟨d, p, e, π, σ, τ, θ⟩ (Definition 44). */
export interface Fiber {
  /** n : 𝔑 — a fresh atom, never reused. */
  readonly uid: number
  readonly inject: readonly Key[]
  readonly provide: readonly Key[]
  /** π: the parent fiber; the root fiber is its own parent. Set at instantiation. */
  parent: Fiber
  /** The derived realization (Definition 27): the fiber's child context. Set at instantiation. */
  ctx: Context
  /** e: the config-applied effect function. */
  apply: EffectCallback
  /** θ: the lifecycle state. */
  state: FiberState
  /** target_n(γ): the provider digest; null is ⊥ (Algorithm 5). */
  target: Map<Key, number> | null
  /** ω: the committed view as VALUES, frozen at L-Begin (Algorithm 6 reads it). */
  committed: Map<Key, unknown> | null
  /** g: the accumulator (recover ∘ …). */
  dispose: Disposer
  /** 𝖥𝗎𝗍𝗎𝗋𝖾 handle: the transition in flight, null when idle. */
  inertia: Promise<void> | null
  /** The outcome ζ: ⊥, or the raise ξ once recorded. */
  error: unknown
  /** τ: the retirement flag (O-Retire / entry disabled). */
  retired: boolean
}

/** The context Γ∞: a first-class object whose property reads are mediated. */
export interface Context {
  effect(callback: EffectCallback): Disposer
  get(key: Key): unknown
  set(key: Key, value: unknown): Disposer
  isolate(key: Key, realm?: Realm): Context
  intercept(key: Key, metadata: unknown): Context
  use(component: Component, config?: unknown, prepare?: (ctx: Context) => Context): Fiber
  /** The parent accumulator (Algorithm 1 line 17): this context's dispose chain. */
  dispose(): Promise<void>
  /** All fibers of the system — dom(F_γ), enumerated. */
  registry(): readonly Fiber[]
  readonly root: Context
  readonly fiber: Fiber
  [key: string]: unknown
}

interface ContextTarget {
  [isolateSym]: Map<Key, Realm>
  [interceptSym]: Map<Key, unknown>
  [fiberSym]: Fiber
  [accumulatorSym]: Disposer
  [delimitersSym]: Map<Key, symbol>
  root: Context
  rootTarget: ContextTarget
  registryList: Fiber[]
  effect: Context['effect']
  get: Context['get']
  set: Context['set']
  isolate: Context['isolate']
  intercept: Context['intercept']
  use: Context['use']
  dispose: Context['dispose']
  registry: Context['registry']
  fiber: Fiber
}

/** The shared value store σ, one per system (per root context). */
const stores = new WeakMap<ContextTarget, Map<Realm, Binding>>()
const storeOf = (ctx: ContextTarget): Map<Realm, Binding> => {
  let map = stores.get(ctx.rootTarget)
  if (map === undefined) {
    map = new Map()
    stores.set(ctx.rootTarget, map)
  }
  return map
}

/** The internal target behind a public context (the proxy wraps it). */
const t = (ctx: Context): ContextTarget => ctx as unknown as ContextTarget

/** ρ(k): the realm a context resolves a key to (its own realm when unisolated). */
export const realmOf = (ctx: Context, key: Key): Realm => t(ctx)[isolateSym].get(key) ?? key

/** The delimiter tag δ_k of a context (Algorithm 7), inherited by default. */
export const delimiterOf = (ctx: Context, key: Key): symbol | undefined => t(ctx)[delimitersSym].get(key)

const digestEq = (a: Map<Key, number> | null, b: Map<Key, number> | null): boolean => {
  if (a === null || b === null) return a === b
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

/**
 * target_n(γ) (Eq. 41): ⊥ when retired or a declared key lacks an ACTIVE
 * provider, else the map key → provider uid. Providers are identified by
 * uid — a fresh atom never reused — so a replaced provider is never mistaken
 * for the one it replaced (§5.1.3).
 */
const computeTarget = (fiber: Fiber): Map<Key, number> | null => {
  if (fiber.retired) return null
  const view = new Map<Key, number>()
  for (const key of fiber.inject) {
    const binding = storeOf(t(fiber.ctx)).get(realmOf(fiber.ctx, key))
    if (binding === undefined || binding.provider.state !== 'ACTIVE') return null
    view.set(key, binding.provider.uid)
  }
  return view
}

/** resolve(inject): the values the declared keys currently resolve to. */
const resolveValues = (fiber: Fiber): Map<Key, unknown> => {
  const committed = new Map<Key, unknown>()
  for (const key of fiber.inject) {
    committed.set(key, storeOf(t(fiber.ctx)).get(realmOf(fiber.ctx, key))?.value)
  }
  return committed
}

/** provided(fiber): the keys whose binding this fiber installed. */
const provided = (fiber: Fiber): readonly Key[] => {
  const keys: Key[] = []
  for (const [realm, binding] of storeOf(t(fiber.ctx))) {
    if (binding.provider === fiber) keys.push(realm)
  }
  return keys
}

/** Schedule an asynchronous transition and record its handle (footnote 2). */
const schedule = (fiber: Fiber, task: () => Promise<void>): Promise<void> => {
  const inertia = task()
  fiber.inertia = inertia
  return inertia
}

/**
 * notify(ctx, keys) (Algorithm 3): propagate a coeffect change to every fiber
 * that declares a changed key AND resolves it to the same realm, re-evaluating
 * each against the new state. Returns the affected fibers so a caller can wait
 * for them — the guard of L-Unload (Algorithm 5 line 25). The optional
 * `affected` predicate replaces the realm test (Algorithm 7 line 15).
 */
export const notify = (
  ctx: Context,
  keys: readonly Key[],
  affected?: (fiber: Fiber, key: Key) => boolean,
): Fiber[] => {
  const result: Fiber[] = []
  for (const fiber of t(ctx).registryList) {
    if (fiber.state === 'FAILED') continue
    for (const key of keys) {
      const matches = affected === undefined
        ? realmOf(fiber.ctx, key) === realmOf(ctx, key)
        : affected(fiber, key)
      if (fiber.inject.includes(key) && matches) {
        refresh(fiber)
        result.push(fiber)
        break
      }
    }
  }
  return result
}

/** O-Retire: force the fiber's target to ⊥ and drain its transition. */
export const retireFiber = async (fiber: Fiber): Promise<void> => {
  fiber.retired = true
  refresh(fiber)
  await whenIdle(fiber)
}

/** O-Remove: drop an INACTIVE, childless fiber from the system registry. */
export const removeFiber = (fiber: Fiber): boolean => {
  const list = t(fiber.ctx).registryList
  const index = list.indexOf(fiber)
  if (index < 0) return true // already removed (idempotent for rollback paths)
  if (fiber.state === 'ACTIVE' || fiber.state === 'LOADING' || fiber.state === 'UNLOADING') return false
  for (const other of list) if (other.parent === fiber) return false
  list.splice(index, 1)
  return true
}

/** Update interception metadata in place (the loader's per-field dispatch). */
export const updateIntercept = (ctx: Context, key: Key, metadata: unknown): void => {
  t(ctx)[interceptSym].set(key, metadata)
}

/** Replace the realm table of a context in place (Algorithm 7 line 8). */
export const setIsolation = (ctx: Context, table: ReadonlyMap<Key, Realm>): void => {
  const realms = t(ctx)[isolateSym]
  realms.clear()
  for (const [k, v] of table) realms.set(k, v)
}

/** Write a fresh delimiter tag at a context (Algorithm 7 line 6). */
export const setDelimiter = (ctx: Context, key: Key, tag: symbol): void => {
  t(ctx)[delimitersSym].set(key, tag)
}

/** Move one store binding between realms (Algorithm 7 lines 12-14). */
export const moveBinding = (ctx: Context, from: Realm, to: Realm): void => {
  const store = storeOf(t(ctx))
  const binding = store.get(from)
  if (binding === undefined) return
  store.set(to, binding)
  store.delete(from)
}

/** The binding at a realm, for Algorithm 7's provider inspection. */
export const bindingAt = (ctx: Context, realm: Realm): { value: unknown; provider: Fiber } | undefined =>
  storeOf(t(ctx)).get(realm)

/**
 * Re-run the fiber's activation against its (possibly re-isolated) context.
 * Routes through the full unload → reload chain (Algorithm 7 line 9): the
 * previous effects recover first, so a re-isolated provider installs its
 * binding at the new realm and withdraws it from the old one.
 */
export const forceReload = async (fiber: Fiber): Promise<void> => {
  await whenIdle(fiber)
  fiber.state = 'UNLOADING'
  const inertia = unload(fiber)
  fiber.inertia = inertia
  await inertia
}

/**
 * refresh(fiber) (Algorithm 5): recompute the target digest; on a change,
 * mark the fiber out of service BEFORE any transition is scheduled — the
 * L-Leave step of §4.3.1 — then initiate reload or unload.
 */
export const refresh = (fiber: Fiber): void => {
  const target = computeTarget(fiber)
  if (digestEq(target, fiber.target)) return
  fiber.target = target
  if (fiber.inertia) return
  if (target !== null) {
    fiber.state = 'LOADING'
    schedule(fiber, () => reload(fiber))
  } else {
    fiber.state = 'UNLOADING'
    schedule(fiber, () => unload(fiber))
  }
}

/**
 * reload(fiber) (Algorithm 5): commit the view, execute the effect function
 * against the committed target, then enter ACTIVE — or chain into unload when
 * the target turned mid-flight (§4.3.3 inertia: the transition completes
 * before the fiber reacts).
 */
export const reload = async (fiber: Fiber): Promise<void> => {
  const target0 = fiber.target
  fiber.committed = resolveValues(fiber)
  try {
    const recover = await execute(fiber.apply, () => digestEq(fiber.target, target0))
    fiber.dispose = composeDisposers(recover, fiber.dispose)
    if (digestEq(fiber.target, target0)) {
      fiber.state = 'ACTIVE'
      notify(fiber.ctx, fiber.provide)
      fiber.inertia = null
    } else {
      fiber.state = 'UNLOADING'
      schedule(fiber, () => unload(fiber))
    }
  } catch (error) {
    // L-Raise: recover what was installed before recording the failure.
    const partial = (error as { inverse?: Disposer }).inverse
    fiber.error = error
    fiber.retired = true
    fiber.target = null
    if (partial) fiber.dispose = composeDisposers(partial, fiber.dispose)
    fiber.state = 'UNLOADING'
    schedule(fiber, () => unload(fiber))
  }
}

/**
 * unload(fiber) (Algorithm 5): drain every notified dependent (the guard
 * ¬relied_n(γ)), recover all tracked effects in LIFO order, then settle
 * INACTIVE — or chain back into reload when the target returned.
 */
export const unload = async (fiber: Fiber): Promise<void> => {
  const dependents = notify(fiber.ctx, fiber.provide)
  await Promise.all(dependents.map((f) => f.inertia).filter((p): p is Promise<void> => p !== null))
  await fiber.dispose()
  await t(fiber.ctx)[accumulatorSym]()
  fiber.dispose = noop
  fiber.committed = null
  if (fiber.target === null) {
    fiber.state = fiber.error === null ? 'INACTIVE' : 'FAILED'
    fiber.inertia = null
  } else {
    fiber.state = 'LOADING'
    schedule(fiber, () => reload(fiber))
  }
}

/** Await a fiber's full quiescence (its transition chain, including reloads). */
export const whenIdle = async (fiber: Fiber): Promise<void> => {
  for (let guard = 0; guard < 10000; guard++) {
    const inertia = fiber.inertia
    if (inertia === null) return
    await inertia
  }
  throw new Error(`fiber ${fiber.uid} did not settle`)
}

/**
 * resolve(ctx, key) (Algorithm 6): walk the fiber chain upward. The first
 * fiber whose committed view binds the key authorizes the access; a fiber
 * that declares the key without having committed it is not loaded
 * (INACTIVE_ACCESS); reaching the root without any declaration rejects the
 * access as undeclared (UNDECLARED_ACCESS).
 */
const resolveAccess = (fiber: Fiber, key: Key): unknown => {
  let current: Fiber = fiber
  for (;;) {
    if (current.committed !== null && current.committed.has(key)) return current.committed.get(key)
    if (current.inject.includes(key)) throw new Error(`INACTIVE_ACCESS: ${String(key)}`)
    if (current.uid === 0) throw new Error(`UNDECLARED_ACCESS: ${String(key)}`)
    current = current.parent
  }
}

/** Wrap a context target in the access-mediating proxy (Algorithm 6). */
const wrap = (target: ContextTarget): Context => new Proxy(target, {
  get(target: ContextTarget, prop) {
    if (typeof prop === 'symbol') return Reflect.get(target, prop)
    if (prop in target) return Reflect.get(target, prop)
    if (prop === 'then') return undefined // keep the context non-thenable
    return resolveAccess(target[fiberSym], prop)
  },
  has(target: ContextTarget, prop) {
    return typeof prop === 'string' && (prop in target || target[fiberSym].committed?.has(prop) === true)
  },
}) as unknown as Context

const deriveContext = (parent: ContextTarget | null, fiber: Fiber): Context => {
  const target: ContextTarget = {
    [isolateSym]: new Map(parent === null ? [] : parent[isolateSym]),
    [interceptSym]: new Map(parent === null ? [] : parent[interceptSym]),
    [fiberSym]: fiber,
    [accumulatorSym]: noop,
    [delimitersSym]: new Map(parent === null ? [] : parent[delimitersSym]),
    root: undefined as unknown as Context,
    rootTarget: undefined as unknown as ContextTarget,
    registryList: parent === null ? [] : parent.registryList,
    fiber,
    effect(this: ContextTarget, callback) {
      const disposer = trackEffect(callback)
      this[accumulatorSym] = composeDisposers(disposer, this[accumulatorSym])
      return disposer
    },
    get(this: ContextTarget, key) {
      return storeOf(this).get(realmOf(this as unknown as Context, key))?.value
    },
    set(this: ContextTarget, key, value) {
      return this.effect(() => {
        const realm = realmOf(this as unknown as Context, key)
        storeOf(this).set(realm, { value, provider: this[fiberSym] })
        notify(this as unknown as Context, [key])
        return () => {
          storeOf(this).delete(realm)
          notify(this as unknown as Context, [key])
        }
      })
    },
    isolate(this: ContextTarget, key, realm = Symbol('realm')) {
      const child = deriveContext(this, this[fiberSym])
      t(child)[isolateSym].set(key, realm)
      t(child)[delimitersSym].set(key, Symbol(`delta:${String(key)}`))
      return child
    },
    intercept(this: ContextTarget, key, metadata) {
      const child = deriveContext(this, this[fiberSym])
      t(child)[interceptSym].set(key, metadata)
      return child
    },
    use(this: ContextTarget, component, config = undefined, prepare) {
      const child: Fiber = {
        uid: ++uidCounter,
        inject: component.inject,
        provide: component.provide,
        parent: this[fiberSym],
        ctx: undefined as unknown as Context,
        apply: () => noop,
        state: 'INACTIVE',
        target: null,
        committed: null,
        dispose: noop,
        inertia: null,
        error: null,
        retired: false,
      }
      let ctx = deriveContext(this, child)
      if (prepare) ctx = prepare(ctx)
      child.ctx = ctx
      child.apply = component.apply(ctx, config)
      this.registryList.push(child)
      this.effect(() => {
        refresh(child)
        return async () => {
          child.retired = true
          refresh(child)
          await child.inertia
        }
      })
      return child
    },
    async dispose(this: ContextTarget) {
      await this[accumulatorSym]()
    },
    registry(this: ContextTarget) {
      return this.registryList
    },
  }
  if (parent === null) {
    target.rootTarget = target
    target.root = wrap(target)
  } else {
    target.root = parent.root
    target.rootTarget = parent.rootTarget
  }
  return parent === null ? target.root : wrap(target)
}

/** Create the root context of a system, with the root fiber (uid 0). */
export const createRoot = (): Context => {
  const rootFiber: Fiber = {
    uid: 0,
    inject: [],
    provide: [],
    parent: undefined as unknown as Fiber,
    ctx: undefined as unknown as Context,
    apply: () => noop,
    state: 'ACTIVE',
    target: new Map(),
    committed: null,
    dispose: noop,
    inertia: null,
    error: null,
    retired: false,
  }
  rootFiber.parent = rootFiber
  const ctx = deriveContext(null, rootFiber)
  rootFiber.ctx = ctx
  return ctx
}
