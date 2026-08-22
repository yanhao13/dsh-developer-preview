var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { Service } from "cordis";
import { defineProperty } from "cosmokit";
var List = class {
  constructor(ctx, trace) {
    this.ctx = ctx;
    this.trace = trace;
    defineProperty(this, Service.tracker, { property: "ctx" });
  }
  ctx;
  trace;
  static {
    __name(this, "List");
  }
  sn = 0;
  inner = /* @__PURE__ */ new Map();
  get length() {
    return this.inner.size;
  }
  push(value) {
    this.ctx.effect(() => {
      this.inner.set(++this.sn, value);
      return () => this.inner.delete(this.sn);
    }, `${this.trace}.push()`);
  }
  *filter(predicate) {
    for (const value of this.inner.values()) {
      if (predicate(value)) yield value;
    }
  }
  *map(mapper) {
    for (const value of this.inner.values()) {
      yield mapper(value);
    }
  }
  [Symbol.iterator]() {
    return this.inner.values();
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this];
  }
};
export {
  List
};
