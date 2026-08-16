/**
 * Algorithm 1 checks: LIFO inverse composition, guard-based interruption,
 * single-shot disposal, the raise path carrying its partial inverse, and the
 * parent composition of ctx.effect.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execute, trackEffect } from '../src/effects.ts'
import { createRoot } from '../src/context.ts'

describe('5.1.1 effect tracking (Algorithm 1)', () => {
  it('execute folds yielded inverses in LIFO order', async () => {
    const ran: number[] = []
    const callback = async function* () {
      yield () => {
        ran.push(1)
      }
      yield () => {
        ran.push(2)
      }
      yield () => {
        ran.push(3)
      }
    }
    const recover = await execute(callback, () => true)
    await recover()
    assert.deepEqual(ran, [3, 2, 1])
  })

  it('the guard stops iteration at a step boundary, keeping the partial inverse', async () => {
    const ran: number[] = []
    let stop = false
    const callback = async function* () {
      stop = true
      yield () => {
        ran.push(1)
      }
      yield () => {
        ran.push(2)
      }
    }
    const recover = await execute(callback, () => !stop)
    await recover()
    assert.deepEqual(ran, [1])
  })

  it('disposing halts an in-flight iteration and recovers only what landed', async () => {
    const ran: number[] = []
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const callback = async function* () {
      yield () => {
        ran.push(1)
      }
      await gate
      yield () => {
        ran.push(2)
      }
    }
    const dispose = trackEffect(callback)
    const settled = dispose()
    release()
    await settled
    assert.deepEqual(ran, [1])
  })

  it('effect disposal fires recovery exactly once', async () => {
    let ran = 0
    const dispose = trackEffect(() => () => {
      ran++
    })
    await dispose()
    await dispose()
    assert.equal(ran, 1)
  })

  it('a raise (𝔈^fail) carries the partial inverse for recovery-before-record', async () => {
    const ran: string[] = []
    const callback = async function* () {
      yield () => {
        ran.push('installed')
      }
      throw new Error('boom')
    }
    await assert.rejects(execute(callback, () => true))
    try {
      await execute(callback, () => true)
    } catch (error) {
      const partial = (error as { inverse?: () => Promise<void> }).inverse
      assert.ok(partial, 'the partial inverse is attached to the raise')
      await partial()
      assert.deepEqual(ran, ['installed'])
    }
  })

  it('ctx.effect composes onto the parent accumulator in LIFO order', async () => {
    const root = createRoot()
    const order: string[] = []
    root.effect(() => () => {
      order.push('first')
    })
    root.effect(() => () => {
      order.push('second')
    })
    await root.dispose()
    assert.deepEqual(order, ['second', 'first'])
  })
})
