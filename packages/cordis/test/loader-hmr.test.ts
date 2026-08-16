/**
 * Section 5.2 checks: declarative configuration reconciliation (per-field
 * dispatch), isolation realm reassignment with delimiters (Algorithm 7), and
 * the three HMR phases (Algorithms 8-10) with transactional rollback.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  bindingAt,
  createRoot,
  realmOf,
  whenIdle,
  type Component,
  type Context,
} from '../src/context.ts'
import { Loader, type Entry } from '../src/loader.ts'
import { classify, createModuleSystem, getDependencies } from '../src/hmr.ts'

const makeProvider = (key: string, value: unknown): Component => ({
  inject: [],
  provide: [key],
  apply: (ctx) => () => ctx.set(key, value),
})

const makeConsumer = (key: string, log: { last?: unknown }): Component => ({
  inject: [key],
  provide: [],
  apply: (ctx) => () => {
    log.last = ctx[key]
    return () => {}
  },
})

const entry = (id: string, url: string, extra: Partial<Entry> = {}): Entry => ({ id, url, ...extra })

describe('5.2.1 declarative configuration', () => {
  it('reconcile creates, updates per field, and removes entries', async () => {
    const root = createRoot()
    let updated = 0
    const configurable: Component = {
      inject: [],
      provide: ['k'],
      apply: (ctx, config) => () => ctx.set('k', (config as { v?: string } | undefined)?.v ?? 'v-default'),
      update: (ctx, next) => {
        updated++
        ctx.set('k', (next as { v: string }).v)
      },
    }
    const versions = new Map<string, Component>([['p', configurable]])
    const loader = new Loader({ root, modules: (url) => versions.get(url)! })
    await loader.reconcile([entry('p', 'p', { config: { v: 'v1' } })])
    assert.equal(root.get('k'), 'v1')
    // config change → the component's update hook decides how to apply it.
    await loader.reconcile([entry('p', 'p', { config: { v: 'v2' } })])
    assert.equal(updated, 1)
    assert.equal(root.get('k'), 'v2')
    // disabled unloads the fiber.
    await loader.reconcile([entry('p', 'p', { config: { v: 'v2' }, disabled: true })])
    assert.equal(root.get('k'), undefined)
    // re-enabled reloads it against the latest config.
    await loader.reconcile([entry('p', 'p', { config: { v: 'v2' }, disabled: false })])
    assert.equal(root.get('k'), 'v2')
    // removal withdraws everything.
    await loader.reconcile([])
    assert.equal(root.get('k'), undefined)
  })

  it('global realm isolation: entries sharing a realm string see one binding', async () => {
    const root = createRoot()
    const log: { last?: unknown } = {}
    const versions = new Map<string, Component>([
      ['p', makeProvider('k', 'shared')],
      ['c', makeConsumer('k', log)],
    ])
    const loader = new Loader({ root, modules: (url) => versions.get(url)! })
    await loader.reconcile([
      entry('p', 'p', { isolate: { k: 'shared-g' } }),
      entry('c', 'c', { isolate: { k: 'shared-g' } }),
    ])
    assert.equal(root.get('k'), undefined) // root resolves the default realm
    const consumerFiber = loader.recordsFor.get('c')!.fiber
    assert.equal(consumerFiber.state, 'ACTIVE')
    assert.equal(log.last, 'shared')
  })

  it('Algorithm 7: reassigning isolation moves the entry\'s own binding, and only it', async () => {
    const root = createRoot()
    const versions = new Map<string, Component>([['p', makeProvider('k', 'mine')]])
    const loader = new Loader({ root, modules: (url) => versions.get(url)! })
    await loader.reconcile([entry('p', 'p', { isolate: { k: true } })])
    const fiber = loader.recordsFor.get('p')!.fiber
    const oldRealm = realmOf(fiber.ctx, 'k')
    assert.ok(bindingAt(root, oldRealm) !== undefined)
    // Move to a global realm: the entry's own binding travels with it.
    await loader.reconcile([entry('p', 'p', { isolate: { k: 'global-g' } })])
    const newRealm = realmOf(fiber.ctx, 'k')
    assert.notEqual(String(oldRealm), String(newRealm))
    assert.equal(bindingAt(root, oldRealm), undefined)
    assert.equal(bindingAt(root, newRealm)?.value, 'mine')
  })
})

describe('5.2.2 hot module replacement', () => {
  it('Algorithm 8: classification accepts stashed modules and declines cycles', () => {
    const system = createModuleSystem(() => ({}), {
      'a': ['b'],
      'b': ['c'],
      'c': ['b'], // cycle
    })
    const { accepted, declined } = classify(system, new Set(['a']), new Set())
    assert.ok(accepted.has('a'))
    // b imports only c, and c cycles back to b: both stay undecided → declined.
    assert.ok(declined.has('b'))
    assert.ok(declined.has('c'))
  })

  it('Algorithm 9: dependency trees respect the declined boundary', () => {
    const system = createModuleSystem(() => ({}), {
      'app': ['ui', 'core'],
      'ui': ['theme'],
      'core': ['native'],
    })
    const tree = getDependencies(system, 'app', new Set(['native']))
    assert.ok(tree.has('app') && tree.has('ui') && tree.has('theme') && tree.has('core'))
    assert.ok(!tree.has('native'))
  })

  it('Algorithm 10: stale entries reload transactionally, with rollback on import failure', async () => {
    const root = createRoot()
    let version = 0
    const factory = (url: string): Component => {
      if (url === 'app') {
        if (version === 2) throw new Error('syntax error in v2')
        return makeProvider('k', `from-v${version}`)
      }
      return makeProvider('k', 'dep')
    }
    const system = createModuleSystem(factory, { app: ['dep'], dep: [] })
    const loader = new Loader({ root, modules: (url) => system.load(url) as Component })
    await loader.reconcile([entry('app', 'app')])
    assert.equal(root.get('k'), 'from-v0')
    // Hot-replace dep: app's tree reaches the accepted module → stale.
    version = 1
    const { accepted } = classify(system, new Set(['dep']), new Set())
    await loader.hmrReload(system, accepted)
    assert.equal(root.get('k'), 'from-v1')
    // A broken replacement rolls back to the backup and rethrows.
    version = 2
    const { accepted: accepted2 } = classify(system, new Set(['dep']), new Set())
    await assert.rejects(loader.hmrReload(system, accepted2), /syntax error/)
    assert.equal(root.get('k'), 'from-v1') // the backed-up component is back
    const fiber = loader.recordsFor.get('app')!.fiber
    await whenIdle(fiber)
    assert.equal(fiber.state, 'ACTIVE')
  })
})
