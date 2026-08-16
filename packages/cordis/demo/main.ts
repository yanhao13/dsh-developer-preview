/**
 * The paper's motivating examples, run on the framework: (1) a VSCode-like
 * plugin host with live unload; (2) a self-evolving agent harness with
 * dependency reactivation and state preserved across a provider swap; (3) the
 * coarse-grained workaround contrast (a restart would discard the preserved
 * state); (4) HMR with transactional rollback. Run with `pnpm run demo`.
 */
import {
  createRoot,
  refresh,
  retireFiber,
  whenIdle,
  type Component,
  type Context,
} from '../src/context.ts'
import { Loader, type Entry } from '../src/loader.ts'
import { classify, createModuleSystem } from '../src/hmr.ts'

const line = (text = ''): void => {
  console.log(text)
}

const provider = (key: string, makeValue: (ctx: Context, config: unknown) => unknown): Component => ({
  inject: [],
  provide: [key],
  apply: (ctx, config) => () => ctx.set(key, makeValue(ctx, config)),
})

/** A plugin that reads `key` on activation AND on teardown (the Theorem 63 case). */
const plugin = (key: string, label: string, log: string[]): Component => ({
  inject: [key],
  provide: [],
  apply: (ctx) => () => {
    log.push(`${label}: saw ${JSON.stringify(ctx[key])}`)
    return () => {
      log.push(`${label}: teardown still saw ${JSON.stringify(ctx[key])}`)
    }
  },
})

const section = (title: string): void => line(`\n===== ${title} =====`)

async function main(): Promise<void> {
  // -------------------------------------------------------------------------
  section('1.2.1 Plugin systems (VSCode) — live unload, no restart')
  {
    const root = createRoot()
    const trace: string[] = []
    const theme = root.use(provider('theme', () => 'solarized-dark'))
    await whenIdle(theme)
    const greet = root.use(plugin('theme', 'greet-command', trace))
    await whenIdle(greet)
    line(`loaded: theme ACTIVE, greet-command ${greet.state}`)
    line(`greet observed: ${trace[0]}`)
    // Disable the theme — in VSCode this needs a host restart; here the
    // dependent deactivates first, reading its binding to the very end.
    await retireFiber(theme)
    line(`theme disabled: theme ${theme.state}, greet-command ${greet.state}`)
    line(`greet teardown: ${trace[1]}`)
    // Re-enable: the same fiber reloads in place.
    theme.retired = false
    refresh(theme)
    await whenIdle(theme)
    await whenIdle(greet)
    line(`theme re-enabled: theme ${theme.state}, greet-command ${greet.state}`)
  }

  // -------------------------------------------------------------------------
  section('1.2.2 Self-evolving agent harnesses — provider swap, state preserved')
  {
    const root = createRoot()
    // An unrelated provider holding process-local accumulated state.
    const cache = { hits: 0 }
    const memoryProvider = root.use(provider('memory', () => cache))
    await whenIdle(memoryProvider)
    // The web tool provider, replaced at runtime.
    const web = root.use(provider('tools.web', () => ({ engine: 'http' })))
    await whenIdle(web)
    const agentLog: string[] = []
    const agent = root.use(plugin('tools.web', 'agent', agentLog))
    await whenIdle(agent)
    line(`agent activated against: ${agentLog[0]}`)
    const before = (root.get('memory') as typeof cache).hits
    // Withdraw the web provider and install a replacement under the same key.
    await retireFiber(web)
    root.set('tools.web', { engine: 'browser' })
    await whenIdle(agent)
    // Keep accumulating in the untouched provider across the swap.
    ;(root.get('memory') as typeof cache).hits++
    ;(root.get('memory') as typeof cache).hits++
    const after = (root.get('memory') as typeof cache).hits
    line(`web provider swapped: agent ${agent.state}, saw ${agentLog[agentLog.length - 1]}`)
    line(`cache hits ${before} → ${after} across the swap (a restart would have lost them)`)
  }

  // -------------------------------------------------------------------------
  section('1.2.3 The coarse-grained workaround — the contrast')
  {
    line('restart (process/container): discards caches, connections, partial computations;')
    line('  seconds-to-minutes to rebuild; replicas needed for availability.')
    line('this runtime: the swap above retired one fiber, recovered exactly its')
    line('  effects, and reactivated its dependents — everything else kept running.')
  }

  // -------------------------------------------------------------------------
  section('5.2.2 Hot module replacement — replace modules without annotations')
  {
    const root = createRoot()
    let themeVersion = 0
    const counter = root.use(provider('counter', () => 0))
    await whenIdle(counter)
    const factory = (url: string): Component => {
      if (url === 'theme') {
        const v = themeVersion
        if (v === 2) throw new Error('syntax error in theme v2')
        return provider('theme', () => `theme-v${v}`)
      }
      return provider(url, () => `${url}-module`)
    }
    const system = createModuleSystem(factory, { theme: [], 'theme-user': ['theme'] })
    const loader = new Loader({ root, modules: (url) => system.load(url) as Component })
    await loader.reconcile([
      { id: 'theme', url: 'theme' },
      { id: 'user', url: 'theme-user' },
    ] as Entry[])
    line(`boot: theme = ${root.get('theme')}`)
    // Edit the theme module on disk (the stash) and hot-replace it.
    themeVersion = 1
    const { accepted } = classify(system, new Set(['theme']), new Set())
    await loader.hmrReload(system, accepted)
    line(`after edit: theme = ${root.get('theme')} (user re-activated against the new module)`)
    line(`counter untouched across the reload: ${root.get('counter')}`)
    // A broken edit rolls back transactionally — the system never half-loads.
    themeVersion = 2
    const { accepted: accepted2 } = classify(system, new Set(['theme']), new Set())
    try {
      await loader.hmrReload(system, accepted2)
    } catch (error) {
      line(`broken edit declined: ${(error as Error).message}`)
    }
    line(`after rollback: theme = ${root.get('theme')} (the backed-up module is back)`)
  }

  section('done')
}

void main()
