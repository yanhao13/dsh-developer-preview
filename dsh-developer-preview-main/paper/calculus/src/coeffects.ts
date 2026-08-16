/**
 * Section 3.2: reactive coeffects. The coeffect context Σ = (k : K) ⇀ 𝒱 k
 * (Definition 22) with get/set (Definition 23), the satisfaction predicate and
 * notify classification (Definitions 25-26), the operation lift (Definition
 * 24), isolation realms (Definitions 28-29), and interception metadata
 * (Definitions 30-31). All mutations go through witnessed effect functions,
 * and isolation/interception take the paper's "derived realization": plain
 * context-to-context maps with no tracked inverse.
 */
import { compose, type Effect } from './core.ts'

/** A dependency key. */
export type Key = string

/** A realm identifier; realms share the universe with keys (R ⊇ K). */
export type Realm = string

/** Thrown when a coeffect precondition fails; no transition occurs. */
export class PreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PreconditionError'
  }
}

// ---------------------------------------------------------------------------
// The base coeffect context Σ (Definition 22)

/** One value at a key together with the key's coeffect triple. */
export interface CoeffectEntry {
  readonly value: unknown
  /** The key's definition: equivalence ≃k and operations 𝒜k. */
  readonly def: CoeffectDefinition
}

/**
 * One coeffect at a key: the equivalence up to which values are compared and
 * the set of operations the value provides (Definition 24).
 */
export interface CoeffectDefinition {
  readonly eq: (a: unknown, b: unknown) => boolean
  readonly operations: Readonly<Record<string, CoeffectOperation>>
}

/** The result of applying a coeffect operation to a value (Definition 24). */
export interface CoeffectOperationResult {
  /** The new value. */
  readonly value: unknown
  /** The inverse on the value type. */
  readonly inverse: (value: unknown) => unknown
  /** The outcome the operation reports to its caller. */
  readonly outcome: unknown
}

/**
 * A coeffect operation a : Xa → 𝒱 k ⇀ 𝒱 k × (𝒱 k ⇀ 𝒱 k) × Ba (Definition 24).
 * The first two constituents form an effect function on 𝒱 k witnessed as
 * Definition 8 requires; `undefined` marks a failed precondition.
 */
export interface CoeffectOperation {
  readonly apply: (value: unknown, arg: unknown) => CoeffectOperationResult | undefined
}

/** The coeffect context: a finite partial map from keys to typed entries. */
export class CoeffectTable {
  private readonly entries: ReadonlyMap<Key, CoeffectEntry>

  private constructor(entries: ReadonlyMap<Key, CoeffectEntry>) {
    this.entries = entries
  }

  static empty(): CoeffectTable {
    return new CoeffectTable(new Map())
  }

  static of(entries: ReadonlyMap<Key, CoeffectEntry>): CoeffectTable {
    return new CoeffectTable(new Map(entries))
  }

  /** σ(k), with the precondition k ∈ dom(σ). */
  get(key: Key): CoeffectEntry {
    const entry = this.entries.get(key)
    if (entry === undefined) throw new PreconditionError(`coeffect key not bound: ${key}`)
    return entry
  }

  has(key: Key): boolean {
    return this.entries.has(key)
  }

  keys(): readonly Key[] {
    return [...this.entries.keys()]
  }

  snapshot(): ReadonlyMap<Key, CoeffectEntry> {
    return this.entries
  }

  /** σ[k ↦ v] — a derived copy, no precondition beyond set's. */
  withEntry(key: Key, entry: CoeffectEntry): CoeffectTable {
    const next = new Map(this.entries)
    next.set(key, entry)
    return new CoeffectTable(next)
  }

  /** σ \ k — a derived copy; used by the inverse of set. */
  without(key: Key): CoeffectTable {
    const next = new Map(this.entries)
    next.delete(key)
    return new CoeffectTable(next)
  }

  /** σ ⊨ d: every declared key is bound (formula 24). */
  satisfies(spec: ReadonlySet<Key>): boolean {
    for (const key of spec) if (!this.entries.has(key)) return false
    return true
  }

  /** Structural equality under each key's own ≃k (Definition 33). */
  eq(other: CoeffectTable): boolean {
    if (this.entries.size !== other.entries.size) return false
    for (const [key, entry] of this.entries) {
      const otherEntry = other.entries.get(key)
      if (otherEntry === undefined) return false
      if (!entry.def.eq(entry.value, otherEntry.value)) return false
    }
    return true
  }
}

/**
 * set (Definition 23): the witnessed effect that binds v at k and carries the
 * deletion as its inverse. Precondition: k ∉ dom(σ).
 */
export const setEffect = (key: Key, value: unknown, def: CoeffectDefinition): Effect<CoeffectTable> =>
  (sigma) => {
    if (sigma.has(key)) throw new PreconditionError(`coeffect already bound: ${key}`)
    return [sigma.withEntry(key, { value, def }), (next) => next.without(key)]
  }

/**
 * The lift of a coeffect operation to the whole context (Definition 24,
 * formula 23): aΣ(x)(σ) reads and writes only the binding at k.
 */
export const liftOperation = (key: Key, opName: string, arg: unknown): Effect<CoeffectTable> =>
  (sigma) => {
    const [delta, inverse] = liftOperationResult(key, opName, arg)(sigma)
    return [delta, inverse]
  }

/**
 * The lift with its outcome exposed — the (δ, s, b) triple of formula 23 and
 * of the coeffect-mediated closure (Definition 41, formula 36).
 */
export const liftOperationResult = (key: Key, opName: string, arg: unknown) =>
  (sigma: CoeffectTable): readonly [next: CoeffectTable, inverse: (s: CoeffectTable) => CoeffectTable, outcome: unknown] => {
    const entry = sigma.get(key)
    const op = entry.def.operations[opName]
    if (op === undefined) throw new PreconditionError(`no operation ${opName} at ${key}`)
    const result = op.apply(entry.value, arg)
    if (result === undefined) throw new PreconditionError(`operation ${key}.${opName} precondition failed`)
    return [
      sigma.withEntry(key, { value: result.value, def: entry.def }),
      (next) => next.withEntry(key, { value: result.inverse(next.get(key).value), def: entry.def }),
      result.outcome,
    ]
  }

/**
 * One stage of a coeffect-mediated effect function (Definition 41): run one
 * operation lift, then continue with the member chosen by its outcome.
 */
export const mediated = (
  stage: (sigma: CoeffectTable) => readonly [next: CoeffectTable, inverse: (s: CoeffectTable) => CoeffectTable, outcome: unknown],
  continuation: (outcome: unknown) => Effect<CoeffectTable>,
): Effect<CoeffectTable> => (sigma) => {
  const [delta, s, outcome] = stage(sigma)
  const [epsilon, t] = continuation(outcome)(delta)
  return [epsilon, compose(s, t)]
}

/**
 * notify_d (Definition 26): classify a transition against a specification.
 */
export type NotifyClassification = 'activating' | 'deactivating' | 'neutral'

export const notify = (
  spec: ReadonlySet<Key>,
  before: CoeffectTable,
  after: CoeffectTable,
): NotifyClassification => {
  const satisfiedBefore = before.satisfies(spec)
  const satisfiedAfter = after.satisfies(spec)
  if (!satisfiedBefore && satisfiedAfter) return 'activating'
  if (satisfiedBefore && !satisfiedAfter) return 'deactivating'
  return 'neutral'
}

// ---------------------------------------------------------------------------
// Coeffect isolation: Σiso = (K ⇀ R) × ((r : R) ⇀ 𝒱 r) (Definitions 28-29)

export interface IsoCoeffectContext {
  /** The isolation realm table ρ. */
  readonly realms: ReadonlyMap<Key, Realm>
  /** The dependency table σ, keyed by realm. */
  readonly table: ReadonlyMap<Realm, CoeffectEntry>
}

export const emptyIso = (): IsoCoeffectContext => ({ realms: new Map(), table: new Map() })

/** Resolve k to its realm: ρ(k) when isolated, k itself otherwise. */
export const realmOf = (ctx: IsoCoeffectContext, key: Key): Realm => ctx.realms.get(key) ?? key

/** get on Σiso: σ(ρ(k)), precondition ρ(k) ∈ dom(σ). */
export const isoGet = (ctx: IsoCoeffectContext, key: Key): CoeffectEntry => {
  const entry = ctx.table.get(realmOf(ctx, key))
  if (entry === undefined) throw new PreconditionError(`realm not bound: ${key}`)
  return entry
}

/** set on Σiso: the witnessed effect routed through the realm table. */
export const isoSet = (key: Key, value: unknown, def: CoeffectDefinition): Effect<IsoCoeffectContext> =>
  (ctx) => {
    const realm = realmOf(ctx, key)
    if (ctx.table.has(realm)) throw new PreconditionError(`realm already bound: ${realm}`)
    const next: IsoCoeffectContext = {
      realms: ctx.realms,
      table: new Map(ctx.table).set(realm, { value, def }),
    }
    return [next, (after) => {
      const nextTable = new Map(after.table)
      nextTable.delete(realmOf(after, key))
      return { realms: after.realms, table: nextTable }
    }]
  }

/** isolate(k, r) (Definition 29): derived realization — rebinds k, keeps the table. */
export const isolate = (ctx: IsoCoeffectContext, key: Key, realm: Realm): IsoCoeffectContext => ({
  realms: new Map(ctx.realms).set(key, realm),
  table: ctx.table,
})

// ---------------------------------------------------------------------------
// Coeffect interception: Σinter (Definitions 30-31)

/** A per-key metadata monoid (𝒩 k, ⊕k, εk). */
export interface MetadataMonoid {
  readonly empty: unknown
  /** ⊕k: merge with the RIGHT operand winning conflicts. */
  readonly merge: (left: unknown, right: unknown) => unknown
}

export interface ProviderEntry {
  readonly monoid: MetadataMonoid
  /** The provider function 𝒩 k → 𝒱 k. */
  readonly provider: (meta: unknown) => unknown
}

export interface InterCoeffectContext {
  /** Context-carried metadata ι, defaulting to each key's εk. */
  readonly meta: ReadonlyMap<Key, unknown>
  /** Provider table σ. */
  readonly providers: ReadonlyMap<Key, ProviderEntry>
}

export const emptyInter = (): InterCoeffectContext => ({ meta: new Map(), providers: new Map() })

/** Context metadata at k: ι(k), or the key's εk when unset. */
export const contextMeta = (ctx: InterCoeffectContext, key: Key, monoid: MetadataMonoid): unknown =>
  ctx.meta.get(key) ?? monoid.empty

/** get on Σinter: σ(k)(μ ⊕k ι(k)) — right-biased, ι wins. */
export const interGet = (ctx: InterCoeffectContext, key: Key, declared: unknown): unknown => {
  const entry = ctx.providers.get(key)
  if (entry === undefined) throw new PreconditionError(`no provider at: ${key}`)
  return entry.provider(entry.monoid.merge(declared, contextMeta(ctx, key, entry.monoid)))
}

/** set on Σinter: the witnessed effect binding a provider function at k. */
export const interSet = (key: Key, monoid: MetadataMonoid, provider: (meta: unknown) => unknown): Effect<InterCoeffectContext> =>
  (ctx) => {
    if (ctx.providers.has(key)) throw new PreconditionError(`provider already bound: ${key}`)
    const next: InterCoeffectContext = {
      meta: ctx.meta,
      providers: new Map(ctx.providers).set(key, { monoid, provider }),
    }
    return [next, (after) => {
      const nextProviders = new Map(after.providers)
      nextProviders.delete(key)
      return { meta: after.meta, providers: nextProviders }
    }]
  }

/** intercept(k, ν) (Definition 31): derived realization merging context metadata. */
export const intercept = (ctx: InterCoeffectContext, key: Key, nu: unknown): InterCoeffectContext => {
  const monoid = ctx.providers.get(key)?.monoid
  const current = ctx.meta.get(key) ?? monoid?.empty
  const merged = monoid === undefined ? nu : monoid.merge(current, nu)
  return { meta: new Map(ctx.meta).set(key, merged), providers: ctx.providers }
}
