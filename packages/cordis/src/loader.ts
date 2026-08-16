/**
 * Section 5.2.1: the declarative component loader. An entry is the faithful
 * specification of one fiber (Definition 74) — it gives the support set of
 * Definition 67 everything it reads (τ, π, d, p). The loader reconciles
 * entries incrementally with per-field dispatch, and reassigns isolation
 * realms with delimiters (Algorithm 7). Reconciliation is sound by Theorem 73
 * (quiescent state is a function of the final configuration), Theorem 66
 * (the system quiesces), Corollary 62 (a departing fiber's contribution is
 * nothing), and Theorem 63 (no load order to arrange).
 */
import {
  bindingAt,
  delimiterOf,
  forceReload,
  moveBinding,
  notify,
  realmOf,
  refresh,
  removeFiber,
  retireFiber,
  setDelimiter,
  setIsolation,
  updateIntercept,
  whenIdle,
  type Component,
  type Context,
  type Fiber,
  type Key,
  type Realm,
} from './context.ts'
import { getDependencies, transactionalReload, type ModuleSystem } from './hmr.ts'

/** Per-key isolation annotation: true = local realm (tagged by entry id), string = global realm. */
export type EntryIsolation = Readonly<Record<string, boolean | string>>

/** An entry: the declarative specification of one fiber (Definition 74). */
export interface Entry {
  /** Stable identifier — the reconciliation key in a group's child list. */
  readonly id: string
  /** The component module this entry instantiates. */
  readonly url: string
  /** Isolation annotations applied to the entry's context. */
  readonly isolate?: EntryIsolation
  /** Interception annotations applied to the entry's context. */
  readonly intercept?: Readonly<Record<string, unknown>>
  /** The configuration bound into the component's apply. */
  readonly config?: unknown
  /** Whether the entry is administratively turned off (τ). */
  readonly disabled?: boolean
}

export interface EntryRecord {
  entry: Entry
  readonly fiber: Fiber
}

export interface LoaderOptions {
  /** Resolves an entry's url to its component (module) implementation. */
  readonly modules: (url: string) => Component
  /** The context entries instantiate under. */
  readonly root: Context
}

export class Loader {
  private readonly options: LoaderOptions
  private readonly records = new Map<string, EntryRecord>()

  constructor(options: LoaderOptions) {
    this.options = options
  }

  get recordsFor(): ReadonlyMap<string, EntryRecord> {
    return this.records
  }

  /** Apply the entry's isolation/interception annotations to its context. */
  private prepare(entry: Entry): (ctx: Context) => Context {
    return (ctx) => {
      let next = ctx
      if (entry.isolate) {
        for (const [key, spec] of Object.entries(entry.isolate)) {
          const realm: Realm = spec === true
            ? Symbol(`realm:${entry.id}:${key}`)
            : Symbol.for(`realm:${String(spec)}`)
          next = next.isolate(key, realm)
        }
      }
      if (entry.intercept) {
        for (const [key, meta] of Object.entries(entry.intercept)) {
          next = next.intercept(key, meta)
        }
      }
      return next
    }
  }

  /** O-Insert for one entry. */
  private instantiate(entry: Entry): EntryRecord {
    const component = this.options.modules(entry.url)
    const fiber = this.options.root.use(component, entry.config, this.prepare(entry))
    const record: EntryRecord = { entry, fiber }
    this.records.set(entry.id, record)
    return record
  }

  /** O-Retire + O-Remove for one entry's fiber. */
  private async destroy(record: EntryRecord): Promise<void> {
    await retireFiber(record.fiber)
    if (!removeFiber(record.fiber)) {
      throw new Error(`cannot remove fiber ${record.fiber.uid} (children still present)`)
    }
  }

  /**
   * Algorithm 7: isolation realm reassignment. Moves the entry's own binding
   * (identified by the delimiter test of Eq. 65) to the new realm, and
   * re-notifies dependents whose relation to the entry's scope changed.
   */
  private async patchIsolation(record: EntryRecord, isolate: EntryIsolation): Promise<void> {
    const { fiber, entry } = record
    const ctx = fiber.ctx
    const oldTable = new Map<Key, Realm>()
    for (const key of Object.keys(isolate)) oldTable.set(key, realmOf(ctx, key))
    const newTable = new Map<Key, Realm>(oldTable)
    for (const [key, spec] of Object.entries(isolate)) {
      newTable.set(key, spec === true ? Symbol(`realm:${entry.id}:${key}`) : Symbol.for(`realm:${String(spec)}`))
    }
    // Δ: keys whose realm changes.
    const delta = [...newTable].filter(([k, v]) => oldTable.get(k) !== v).map(([k]) => k)
    const diff = new Map<Key, { s1: Realm; s2: Realm; d1: symbol | undefined; d2: symbol | undefined }>()
    for (const key of delta) {
      const s1 = oldTable.get(key)!
      const s2 = newTable.get(key)!
      const d1 = Symbol(`delta:${entry.id}:${String(key)}`) // fresh tag (Algorithm 7 line 6)
      setDelimiter(ctx, key, d1)
      const providerCtx = bindingAt(ctx, s1)?.provider.ctx
      diff.set(key, { s1, s2, d1, d2: providerCtx === undefined ? undefined : delimiterOf(providerCtx, key) })
    }
    setIsolation(ctx, newTable)
    await forceReload(fiber)
    for (const key of delta) {
      const { s1, s2, d1, d2 } = diff.get(key)!
      if (d1 !== undefined && d1 === d2 && bindingAt(ctx, s1) !== undefined && bindingAt(ctx, s2) === undefined) {
        moveBinding(ctx, s1, s2) // the binding is the entry's own: it moves with it
      }
    }
    notify(ctx, delta, (other, key) => {
      const { s1, d1, d2 } = diff.get(key) ?? { s1: undefined, d1: undefined, d2: undefined }
      const realm = realmOf(other.ctx, key)
      if (s1 === undefined) return false
      const s2 = newTable.get(key)!
      if (realm !== s1 && realm !== s2) return false
      return (delimiterOf(other.ctx, key) === d1) !== (d1 === d2)
    })
  }

  /**
   * Reconcile the entry list: a keyed diff over entry ids, with per-field
   * dispatch on updates. id/url changes rebuild the entry; isolate changes
   * run Algorithm 7; intercept changes update in place; config changes are
   * handed to the component (rebuild when it has no update hook); disabled
   * unloads/reloads the fiber. Awaits every transition before returning.
   */
  async reconcile(nextEntries: readonly Entry[]): Promise<void> {
    const next = new Map(nextEntries.map((entry) => [entry.id, entry]))
    const removed: EntryRecord[] = []
    for (const [id, record] of this.records) {
      if (!next.has(id)) {
        removed.push(record)
        this.records.delete(id)
      }
    }
    for (const [id, record] of this.records) {
      const entry = next.get(id)!
      const prev = record.entry
      if (entry.url !== prev.url || entry.id !== prev.id) {
        await this.destroy(record)
        this.instantiate(entry)
        continue
      }
      if (JSON.stringify(entry.isolate ?? {}) !== JSON.stringify(prev.isolate ?? {})) {
        record.entry = entry as Entry
        await this.patchIsolation({ entry: entry as Entry, fiber: record.fiber }, entry.isolate ?? {})
        continue
      }
      if (JSON.stringify(entry.intercept ?? {}) !== JSON.stringify(prev.intercept ?? {})) {
        for (const [key, meta] of Object.entries(entry.intercept ?? {})) {
          updateIntercept(record.fiber.ctx, key, meta)
        }
      }
      const component = this.options.modules(entry.url)
      if (!Object.is(entry.config, prev.config)) {
        // Re-bind the fiber's effect function with the new payload, then hand
        // the change to the component: it decides how to apply it (typically a
        // diff, reloading only on a material change) — or the entry rebuilds.
        record.fiber.apply = component.apply(record.fiber.ctx, entry.config)
        if (component.update) {
          await component.update(record.fiber.ctx, entry.config)
        } else {
          await this.destroy(record)
          this.instantiate(entry)
          continue
        }
      }
      if (!!entry.disabled !== !!prev.disabled) {
        if (entry.disabled) {
          await retireFiber(record.fiber)
        } else {
          record.fiber.retired = false
          refresh(record.fiber)
          await whenIdle(record.fiber)
        }
      }
      record.entry = entry as Entry
    }
    for (const record of removed) await this.destroy(record)
    for (const entry of nextEntries) {
      if (!this.records.has(entry.id)) this.instantiate(entry)
    }
    // Await every transition the reconciliation scheduled.
    for (const record of this.records.values()) await whenIdle(record.fiber)
  }

  /**
   * Phase 2+3 of HMR (§5.2.2): find the entries whose dependency tree reaches
   * an accepted module, then reload them transactionally (Algorithm 10) —
   * disposing each stale fiber and re-instantiating it from the reloaded
   * module, with full rollback on any import failure.
   */
  async hmrReload(system: ModuleSystem, accepted: ReadonlySet<string>): Promise<void> {
    const slots: { entry: Entry; fiber: Fiber }[] = []
    // Fold each stale entry's whole tree into the accepted set (Algorithm 9
    // line 14), so every stale module along it is invalidated in phase 3.
    const acceptedAll = new Set(accepted)
    for (const record of this.records.values()) {
      const tree = getDependencies(system, record.entry.url, new Set())
      if ([...tree].some((dep) => accepted.has(dep))) {
        for (const dep of tree) acceptedAll.add(dep)
        slots.push({ entry: record.entry, fiber: record.fiber })
      }
    }
    await transactionalReload(
      system,
      acceptedAll,
      slots,
      async (fiber) => {
        const f = fiber as Fiber
        await retireFiber(f)
        if (!removeFiber(f)) throw new Error(`cannot remove stale fiber ${f.uid}`)
      },
      (entry) => this.instantiate(entry as Entry).fiber,
    )
    for (const slot of slots) {
      this.records.set(slot.entry.id, { entry: slot.entry, fiber: slot.fiber })
    }
    for (const record of this.records.values()) await whenIdle(record.fiber)
  }
}
