/**
 * Section 3.2: reactive coeffects. The coeffect context Σ = (k : K) ⇀ 𝒱 k
 * (Definition 22) with get/set (Definition 23), the satisfaction predicate and
 * notify classification (Definitions 25-26), the operation lift (Definition
 * 24), isolation realms (Definitions 28-29), and interception metadata
 * (Definitions 30-31). All mutations go through witnessed effect functions,
 * and isolation/interception take the paper's "derived realization": plain
 * context-to-context maps with no tracked inverse.
 */
import { compose } from './core.ts';
/** Thrown when a coeffect precondition fails; no transition occurs. */
export class PreconditionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PreconditionError';
    }
}
/** The coeffect context: a finite partial map from keys to typed entries. */
export class CoeffectTable {
    entries;
    constructor(entries) {
        this.entries = entries;
    }
    static empty() {
        return new CoeffectTable(new Map());
    }
    static of(entries) {
        return new CoeffectTable(new Map(entries));
    }
    /** σ(k), with the precondition k ∈ dom(σ). */
    get(key) {
        const entry = this.entries.get(key);
        if (entry === undefined)
            throw new PreconditionError(`coeffect key not bound: ${key}`);
        return entry;
    }
    has(key) {
        return this.entries.has(key);
    }
    keys() {
        return [...this.entries.keys()];
    }
    snapshot() {
        return this.entries;
    }
    /** σ[k ↦ v] — a derived copy, no precondition beyond set's. */
    withEntry(key, entry) {
        const next = new Map(this.entries);
        next.set(key, entry);
        return new CoeffectTable(next);
    }
    /** σ \ k — a derived copy; used by the inverse of set. */
    without(key) {
        const next = new Map(this.entries);
        next.delete(key);
        return new CoeffectTable(next);
    }
    /** σ ⊨ d: every declared key is bound (formula 24). */
    satisfies(spec) {
        for (const key of spec)
            if (!this.entries.has(key))
                return false;
        return true;
    }
    /** Structural equality under each key's own ≃k (Definition 33). */
    eq(other) {
        if (this.entries.size !== other.entries.size)
            return false;
        for (const [key, entry] of this.entries) {
            const otherEntry = other.entries.get(key);
            if (otherEntry === undefined)
                return false;
            if (!entry.def.eq(entry.value, otherEntry.value))
                return false;
        }
        return true;
    }
}
/**
 * set (Definition 23): the witnessed effect that binds v at k and carries the
 * deletion as its inverse. Precondition: k ∉ dom(σ).
 */
export const setEffect = (key, value, def) => (sigma) => {
    if (sigma.has(key))
        throw new PreconditionError(`coeffect already bound: ${key}`);
    return [sigma.withEntry(key, { value, def }), (next) => next.without(key)];
};
/**
 * The lift of a coeffect operation to the whole context (Definition 24,
 * formula 23): aΣ(x)(σ) reads and writes only the binding at k.
 */
export const liftOperation = (key, opName, arg) => (sigma) => {
    const [delta, inverse] = liftOperationResult(key, opName, arg)(sigma);
    return [delta, inverse];
};
/**
 * The lift with its outcome exposed — the (δ, s, b) triple of formula 23 and
 * of the coeffect-mediated closure (Definition 41, formula 36).
 */
export const liftOperationResult = (key, opName, arg) => (sigma) => {
    const entry = sigma.get(key);
    const op = entry.def.operations[opName];
    if (op === undefined)
        throw new PreconditionError(`no operation ${opName} at ${key}`);
    const result = op.apply(entry.value, arg);
    if (result === undefined)
        throw new PreconditionError(`operation ${key}.${opName} precondition failed`);
    return [
        sigma.withEntry(key, { value: result.value, def: entry.def }),
        (next) => next.withEntry(key, { value: result.inverse(next.get(key).value), def: entry.def }),
        result.outcome,
    ];
};
/**
 * One stage of a coeffect-mediated effect function (Definition 41): run one
 * operation lift, then continue with the member chosen by its outcome.
 */
export const mediated = (stage, continuation) => (sigma) => {
    const [delta, s, outcome] = stage(sigma);
    const [epsilon, t] = continuation(outcome)(delta);
    return [epsilon, compose(s, t)];
};
export const notify = (spec, before, after) => {
    const satisfiedBefore = before.satisfies(spec);
    const satisfiedAfter = after.satisfies(spec);
    if (!satisfiedBefore && satisfiedAfter)
        return 'activating';
    if (satisfiedBefore && !satisfiedAfter)
        return 'deactivating';
    return 'neutral';
};
export const emptyIso = () => ({ realms: new Map(), table: new Map() });
/** Resolve k to its realm: ρ(k) when isolated, k itself otherwise. */
export const realmOf = (ctx, key) => ctx.realms.get(key) ?? key;
/** get on Σiso: σ(ρ(k)), precondition ρ(k) ∈ dom(σ). */
export const isoGet = (ctx, key) => {
    const entry = ctx.table.get(realmOf(ctx, key));
    if (entry === undefined)
        throw new PreconditionError(`realm not bound: ${key}`);
    return entry;
};
/** set on Σiso: the witnessed effect routed through the realm table. */
export const isoSet = (key, value, def) => (ctx) => {
    const realm = realmOf(ctx, key);
    if (ctx.table.has(realm))
        throw new PreconditionError(`realm already bound: ${realm}`);
    const next = {
        realms: ctx.realms,
        table: new Map(ctx.table).set(realm, { value, def }),
    };
    return [next, (after) => {
            const nextTable = new Map(after.table);
            nextTable.delete(realmOf(after, key));
            return { realms: after.realms, table: nextTable };
        }];
};
/** isolate(k, r) (Definition 29): derived realization — rebinds k, keeps the table. */
export const isolate = (ctx, key, realm) => ({
    realms: new Map(ctx.realms).set(key, realm),
    table: ctx.table,
});
export const emptyInter = () => ({ meta: new Map(), providers: new Map() });
/** Context metadata at k: ι(k), or the key's εk when unset. */
export const contextMeta = (ctx, key, monoid) => ctx.meta.get(key) ?? monoid.empty;
/** get on Σinter: σ(k)(μ ⊕k ι(k)) — right-biased, ι wins. */
export const interGet = (ctx, key, declared) => {
    const entry = ctx.providers.get(key);
    if (entry === undefined)
        throw new PreconditionError(`no provider at: ${key}`);
    return entry.provider(entry.monoid.merge(declared, contextMeta(ctx, key, entry.monoid)));
};
/** set on Σinter: the witnessed effect binding a provider function at k. */
export const interSet = (key, monoid, provider) => (ctx) => {
    if (ctx.providers.has(key))
        throw new PreconditionError(`provider already bound: ${key}`);
    const next = {
        meta: ctx.meta,
        providers: new Map(ctx.providers).set(key, { monoid, provider }),
    };
    return [next, (after) => {
            const nextProviders = new Map(after.providers);
            nextProviders.delete(key);
            return { meta: after.meta, providers: nextProviders };
        }];
};
/** intercept(k, ν) (Definition 31): derived realization merging context metadata. */
export const intercept = (ctx, key, nu) => {
    const monoid = ctx.providers.get(key)?.monoid;
    const current = ctx.meta.get(key) ?? monoid?.empty;
    const merged = monoid === undefined ? nu : monoid.merge(current, nu);
    return { meta: new Map(ctx.meta).set(key, merged), providers: ctx.providers };
};
