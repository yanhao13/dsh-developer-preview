/**
 * Section 5.1 checks: coeffect operations and the proxy access control
 * (Algorithms 2 and 6), the reactive fiber lifecycle (Algorithm 5) including
 * the ordering and guard of Theorem 63, failure (L-Raise), the registration
 * cascade (Definition 47), and the events-on-coeffects mapping.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  createRoot,
  retireFiber,
  whenIdle,
  type Component,
  type Context,
  type Disposer,
} from '../src/context.ts'
import { emit, eventRegistry, subscribe } from '../src/events.ts'

const provider = (key: string, makeValue: (ctx: Context) => unknown): Component => ({
  inject: [],
  provide: [key],
  apply: (ctx) => () => ctx.set(key, makeValue(ctx)),
})

const consumer = (key: string, log: { last?: unknown; teardown?: unknown }): Component => ({
  inject: [key],
  provide: [],
  apply: (ctx) => () => {
    log.last = ctx[key] // proxy read through the committed view
    return () => {
      log.teardown = ctx[key] // teardown still reads the committed binding
    }
  },
})

describe('5.1.2 coeffect operations', () => {
  it('get/set/isolation/interception (Algorithm 2, Definitions 29/31)', async () => {
    const root = createRoot()
    const unset = root.set('k', 'v')
    assert.equal(root.get('k'), 'v')
    // Isolation derives a context whose realm differs: independent bindings.
    const child = root.isolate('k')
    assert.equal(child.get('k'), undefined)
    child.set('k', 'w')
    assert.equal(root.get('k'), 'v')
    assert.equal(child.get('k'), 'w')
    // Interception derives a context carrying metadata (consulted at read time).
    const intercepted = root.intercept('k', { limit: 1 })
    assert.ok(intercepted !== root)
    await unset()
    assert.equal(root.get('k'), undefined)
  })

  it('set recovery is automatic on fiber unload', async () => {
    const root = createRoot()
    const fiber = root.use(provider('theme', () => 'dark'))
    await whenIdle(fiber)
    assert.equal(root.get('theme'), 'dark')
    await retireFiber(fiber)
    assert.equal(root.get('theme'), undefined)
    assert.equal(fiber.state, 'INACTIVE')
  })
})

describe('5.1.3 component lifecycle (Algorithm 5)', () => {
  it('a consumer activates when its dependency appears and reads the committed binding', async () => {
    const root = createRoot()
    const log: { last?: unknown } = {}
    const c = root.use(consumer('theme', log))
    await whenIdle(c)
    assert.equal(c.state, 'INACTIVE') // unsatisfied: never began
    const p = root.use(provider('theme', () => 'dark'))
    await whenIdle(p)
    await whenIdle(c)
    assert.equal(c.state, 'ACTIVE')
    assert.equal(log.last, 'dark')
  })

  it('Theorem 63: the provider withdraws only after its consumer, and the consumer reads its binding throughout teardown', async () => {
    const root = createRoot()
    const log: { last?: unknown; teardown?: unknown } = {}
    const p = root.use(provider('theme', () => 'dark'))
    await whenIdle(p)
    const c = root.use(consumer('theme', log))
    await whenIdle(c)
    assert.equal(c.state, 'ACTIVE')
    await retireFiber(p)
    assert.equal(p.state, 'INACTIVE')
    assert.equal(c.state, 'INACTIVE')
    assert.equal(log.last, 'dark')
    assert.equal(log.teardown, 'dark') // committed view survives the consumer's teardown
  })

  it('a provider overwriting its own binding in place is not observed; withdrawal + fresh install reloads dependents', async () => {
    const root = createRoot()
    let value = 'v1'
    const p = root.use(provider('theme', () => value))
    await whenIdle(p)
    const log: { last?: unknown } = {}
    const c = root.use(consumer('theme', log))
    await whenIdle(c)
    assert.equal(log.last, 'v1')
    // In-place overwrite: same provider uid, same realm — no dependent reload.
    const unset = p.ctx.set('theme', 'v2')
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(log.last, 'v1') // the consumer kept its committed view
    // Withdraw and reinstall: the dependent reloads against the new binding.
    await unset()
    value = 'v3'
    p.ctx.set('theme', value)
    await whenIdle(c)
    assert.equal(log.last, 'v3')
  })

  it('L-Raise: a failing component installs nothing, records the error, and never re-enters', async () => {
    const root = createRoot()
    const failing: Component = {
      inject: [],
      provide: ['x'],
      apply: () => () => {
        throw new Error('boom')
      },
    }
    const f = root.use(failing)
    await whenIdle(f)
    assert.equal(f.state, 'FAILED')
    assert.ok(f.error instanceof Error)
    assert.equal(root.get('x'), undefined)
    // Siblings are unaffected.
    const s = root.use(provider('ok', () => 1))
    await whenIdle(s)
    assert.equal(s.state, 'ACTIVE')
  })

  it('Definition 47: unloading a parent retires the components it registered', async () => {
    const root = createRoot()
    const registrar: Component = {
      inject: [],
      provide: [],
      apply: (ctx) => () => {
        ctx.use(provider('child-key', () => 'c'))
        return () => {}
      },
    }
    const parent = root.use(registrar)
    await whenIdle(parent)
    const child = root.registry().find((f) => f.parent === parent)!
    assert.ok(child, 'the registration created a child fiber')
    await whenIdle(child)
    assert.equal(root.get('child-key'), 'c')
    await retireFiber(parent)
    assert.ok(child.retired, 'the parent retirement cascaded to the child')
    assert.equal(child.state, 'INACTIVE')
    assert.equal(root.get('child-key'), undefined)
  })
})

describe('5.1.4 context access (Algorithm 6)', () => {
  it('the proxy enforces the coeffect specification at the point of use', async () => {
    const root = createRoot()
    // Undeclared access rejects.
    assert.throws(() => root.unknownKey, /UNDECLARED_ACCESS/)
    // A declared-but-uncommitted key rejects with INACTIVE_ACCESS.
    const c = root.use(consumer('theme', {}))
    await whenIdle(c)
    assert.throws(() => c.ctx.theme, /INACTIVE_ACCESS/)
    const p = root.use(provider('theme', () => 'dark'))
    await whenIdle(p)
    await whenIdle(c)
    assert.equal(c.ctx.theme, 'dark')
  })
})

describe('events on coeffects', () => {
  it('subscriptions are tracked effects: withdrawn automatically on unload', async () => {
    const root = createRoot()
    const registry = eventRegistry()
    root.set('event:x', registry)
    const seen: unknown[] = []
    const c: Component = {
      inject: ['event:x'],
      provide: [],
      apply: (ctx) => () => {
        const unsub: Disposer = subscribe(ctx, 'event:x', (...args) => {
          seen.push(args)
        })
        return () => unsub()
      },
    }
    const fiber = root.use(c)
    await whenIdle(fiber)
    emit(registry, 'a', 1)
    assert.deepEqual(seen, [['a', 1]])
    await retireFiber(fiber)
    emit(registry, 'b', 2)
    assert.deepEqual(seen, [['a', 1]]) // the subscription left with the fiber
  })
})
