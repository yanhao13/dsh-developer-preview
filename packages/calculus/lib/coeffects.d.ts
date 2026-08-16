/**
 * Section 3.2: reactive coeffects. The coeffect context Σ = (k : K) ⇀ 𝒱 k
 * (Definition 22) with get/set (Definition 23), the satisfaction predicate and
 * notify classification (Definitions 25-26), the operation lift (Definition
 * 24), isolation realms (Definitions 28-29), and interception metadata
 * (Definitions 30-31). All mutations go through witnessed effect functions,
 * and isolation/interception take the paper's "derived realization": plain
 * context-to-context maps with no tracked inverse.
 */
import { type Effect } from './core.ts';
/** A dependency key. */
export type Key = string;
/** A realm identifier; realms share the universe with keys (R ⊇ K). */
export type Realm = string;
/** Thrown when a coeffect precondition fails; no transition occurs. */
export declare class PreconditionError extends Error {
    constructor(message: string);
}
/** One value at a key together with the key's coeffect triple. */
export interface CoeffectEntry {
    readonly value: unknown;
    /** The key's definition: equivalence ≃k and operations 𝒜k. */
    readonly def: CoeffectDefinition;
}
/**
 * One coeffect at a key: the equivalence up to which values are compared and
 * the set of operations the value provides (Definition 24).
 */
export interface CoeffectDefinition {
    readonly eq: (a: unknown, b: unknown) => boolean;
    readonly operations: Readonly<Record<string, CoeffectOperation>>;
}
/** The result of applying a coeffect operation to a value (Definition 24). */
export interface CoeffectOperationResult {
    /** The new value. */
    readonly value: unknown;
    /** The inverse on the value type. */
    readonly inverse: (value: unknown) => unknown;
    /** The outcome the operation reports to its caller. */
    readonly outcome: unknown;
}
/**
 * A coeffect operation a : Xa → 𝒱 k ⇀ 𝒱 k × (𝒱 k ⇀ 𝒱 k) × Ba (Definition 24).
 * The first two constituents form an effect function on 𝒱 k witnessed as
 * Definition 8 requires; `undefined` marks a failed precondition.
 */
export interface CoeffectOperation {
    readonly apply: (value: unknown, arg: unknown) => CoeffectOperationResult | undefined;
}
/** The coeffect context: a finite partial map from keys to typed entries. */
export declare class CoeffectTable {
    private readonly entries;
    private constructor();
    static empty(): CoeffectTable;
    static of(entries: ReadonlyMap<Key, CoeffectEntry>): CoeffectTable;
    /** σ(k), with the precondition k ∈ dom(σ). */
    get(key: Key): CoeffectEntry;
    has(key: Key): boolean;
    keys(): readonly Key[];
    snapshot(): ReadonlyMap<Key, CoeffectEntry>;
    /** σ[k ↦ v] — a derived copy, no precondition beyond set's. */
    withEntry(key: Key, entry: CoeffectEntry): CoeffectTable;
    /** σ \ k — a derived copy; used by the inverse of set. */
    without(key: Key): CoeffectTable;
    /** σ ⊨ d: every declared key is bound (formula 24). */
    satisfies(spec: ReadonlySet<Key>): boolean;
    /** Structural equality under each key's own ≃k (Definition 33). */
    eq(other: CoeffectTable): boolean;
}
/**
 * set (Definition 23): the witnessed effect that binds v at k and carries the
 * deletion as its inverse. Precondition: k ∉ dom(σ).
 */
export declare const setEffect: (key: Key, value: unknown, def: CoeffectDefinition) => Effect<CoeffectTable>;
/**
 * The lift of a coeffect operation to the whole context (Definition 24,
 * formula 23): aΣ(x)(σ) reads and writes only the binding at k.
 */
export declare const liftOperation: (key: Key, opName: string, arg: unknown) => Effect<CoeffectTable>;
/**
 * The lift with its outcome exposed — the (δ, s, b) triple of formula 23 and
 * of the coeffect-mediated closure (Definition 41, formula 36).
 */
export declare const liftOperationResult: (key: Key, opName: string, arg: unknown) => (sigma: CoeffectTable) => readonly [next: CoeffectTable, inverse: (s: CoeffectTable) => CoeffectTable, outcome: unknown];
/**
 * One stage of a coeffect-mediated effect function (Definition 41): run one
 * operation lift, then continue with the member chosen by its outcome.
 */
export declare const mediated: (stage: (sigma: CoeffectTable) => readonly [next: CoeffectTable, inverse: (s: CoeffectTable) => CoeffectTable, outcome: unknown], continuation: (outcome: unknown) => Effect<CoeffectTable>) => Effect<CoeffectTable>;
/**
 * notify_d (Definition 26): classify a transition against a specification.
 */
export type NotifyClassification = 'activating' | 'deactivating' | 'neutral';
export declare const notify: (spec: ReadonlySet<Key>, before: CoeffectTable, after: CoeffectTable) => NotifyClassification;
export interface IsoCoeffectContext {
    /** The isolation realm table ρ. */
    readonly realms: ReadonlyMap<Key, Realm>;
    /** The dependency table σ, keyed by realm. */
    readonly table: ReadonlyMap<Realm, CoeffectEntry>;
}
export declare const emptyIso: () => IsoCoeffectContext;
/** Resolve k to its realm: ρ(k) when isolated, k itself otherwise. */
export declare const realmOf: (ctx: IsoCoeffectContext, key: Key) => Realm;
/** get on Σiso: σ(ρ(k)), precondition ρ(k) ∈ dom(σ). */
export declare const isoGet: (ctx: IsoCoeffectContext, key: Key) => CoeffectEntry;
/** set on Σiso: the witnessed effect routed through the realm table. */
export declare const isoSet: (key: Key, value: unknown, def: CoeffectDefinition) => Effect<IsoCoeffectContext>;
/** isolate(k, r) (Definition 29): derived realization — rebinds k, keeps the table. */
export declare const isolate: (ctx: IsoCoeffectContext, key: Key, realm: Realm) => IsoCoeffectContext;
/** A per-key metadata monoid (𝒩 k, ⊕k, εk). */
export interface MetadataMonoid {
    readonly empty: unknown;
    /** ⊕k: merge with the RIGHT operand winning conflicts. */
    readonly merge: (left: unknown, right: unknown) => unknown;
}
export interface ProviderEntry {
    readonly monoid: MetadataMonoid;
    /** The provider function 𝒩 k → 𝒱 k. */
    readonly provider: (meta: unknown) => unknown;
}
export interface InterCoeffectContext {
    /** Context-carried metadata ι, defaulting to each key's εk. */
    readonly meta: ReadonlyMap<Key, unknown>;
    /** Provider table σ. */
    readonly providers: ReadonlyMap<Key, ProviderEntry>;
}
export declare const emptyInter: () => InterCoeffectContext;
/** Context metadata at k: ι(k), or the key's εk when unset. */
export declare const contextMeta: (ctx: InterCoeffectContext, key: Key, monoid: MetadataMonoid) => unknown;
/** get on Σinter: σ(k)(μ ⊕k ι(k)) — right-biased, ι wins. */
export declare const interGet: (ctx: InterCoeffectContext, key: Key, declared: unknown) => unknown;
/** set on Σinter: the witnessed effect binding a provider function at k. */
export declare const interSet: (key: Key, monoid: MetadataMonoid, provider: (meta: unknown) => unknown) => Effect<InterCoeffectContext>;
/** intercept(k, ν) (Definition 31): derived realization merging context metadata. */
export declare const intercept: (ctx: InterCoeffectContext, key: Key, nu: unknown) => InterCoeffectContext;
