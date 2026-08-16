/**
 * Test support: a finite context instantiation Γ = {x, y} with x, y ∈ {0,1,2}
 * (nine states), exhaustive function-equality helpers, a probe set of context
 * transformations, and a seeded PRNG for randomized sequences. The paper's
 * metatheorems become exhaustive or randomized checks over this domain.
 */
import type { ContextTransform, Effect, EffectContext } from '../src/core.ts'

/** The concrete context type for all checks. */
export interface Ctx {
  readonly x: 0 | 1 | 2
  readonly y: 0 | 1 | 2
}

/** All nine context states, in lexicographic order. */
export const domain: readonly Ctx[] = []
for (const x of [0, 1, 2] as const) {
  for (const y of [0, 1, 2] as const) {
    domain.push({ x, y })
  }
}

/** Structural equality on the finite context. */
export const eqCtx = (a: Ctx, b: Ctx): boolean => a.x === b.x && a.y === b.y

/** Behavioral equality of transformations on the finite domain. */
export const eqFn = (f: ContextTransform<Ctx>, g: ContextTransform<Ctx>): boolean =>
  domain.every((c) => eqCtx(f(c), g(c)))

/** Behavioral equality of effect functions on the finite domain. */
export const eqEff = (e1: Effect<Ctx>, e2: Effect<Ctx>): boolean => domain.every((c) => {
  const [d1, g1] = e1(c)
  const [d2, g2] = e2(c)
  return eqCtx(d1, d2) && eqFn(g1, g2)
})

/** Behavioral equality of effect contexts. */
export const eqEffectContext = (a: EffectContext<Ctx>, b: EffectContext<Ctx>): boolean =>
  eqCtx(a.state, b.state) && eqFn(a.accumulator, b.accumulator)

/** A finite probe set of transformations for accumulator comparisons. */
export const transformProbes: readonly ContextTransform<Ctx>[] = [
  (c) => c,
  (c) => ({ x: ((c.x + 1) % 3) as Ctx['x'], y: c.y }),
  (c) => ({ x: ((c.x + 2) % 3) as Ctx['x'], y: c.y }),
  (c) => ({ x: c.x, y: ((c.y + 1) % 3) as Ctx['y'] }),
  (c) => ({ x: c.x, y: ((c.y + 2) % 3) as Ctx['y'] }),
  (c) => ({ x: c.y, y: c.x }),
  (c) => ({ x: ((c.x + 1) % 3) as Ctx['x'], y: ((c.y + 1) % 3) as Ctx['y'] }),
  () => ({ x: 0, y: 0 }),
]

/** Deterministic PRNG (mulberry32) for randomized sequences. */
export const mulberry32 = (seed: number): (() => number) => {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
