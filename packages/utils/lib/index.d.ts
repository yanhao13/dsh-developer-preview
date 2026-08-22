import { Context } from 'cordis';
export declare class List<T> {
    ctx: Context;
    private trace;
    private sn;
    private inner;
    constructor(ctx: Context, trace: string);
    get length(): number;
    push(value: T): void;
    filter(predicate: (value: T) => boolean): Generator<T, void, unknown>;
    map<U>(mapper: (value: T) => U): Generator<U, void, unknown>;
    [Symbol.iterator](): MapIterator<T>;
}
