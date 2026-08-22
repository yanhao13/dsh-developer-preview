/**
 * tests/core.test.ts
 *
 * Core-semantics tests for the Cordis reproduction.
 *
 * This suite validates the runtime guarantees that make Cordis a framework for
 * spatiotemporal composability:
 *
 * 1.  revertible effect tracking with LIFO inverse composition;
 * 2.  coeffect provision, isolation, and interception;
 * 3.  reactive fiber activation/deactivation;
 * 4.  guarded provider withdrawal (dependents deactivate first);
 * 5.  failure recovery without leaking partial effects;
 * 6.  declarative loader reconciliation;
 * 7.  transactional hot module replacement with rollback.
 *
 * The asynchronous lifecycle is driven by microtasks, so every test that
 * involves fibers first waits for the relevant lifecycle state to be reached.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Context, EffectEngine, Fiber, HMR, Loader } from '../src';
import type { Component, EffectCallback, Key } from '../src';

/* ------------------------------------------------------------------ *
 * Test helpers
 * ------------------------------------------------------------------ */

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cordis-core-'));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Waits until `condition()` returns true, polling on a short timer.
 * Throws a descriptive error on timeout.
 */
async function waitFor(
  condition: () => boolean,
  description: string,
  timeout = 3000,
): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  throw new Error(`Timed out waiting for: ${description}`);
}

/**
 * Waits until a fiber reaches an expected lifecycle state.
 */
async function waitForState(
  fiber: Fiber,
  state: Fiber['state'],
  timeout = 3000,
): Promise<void> {
  await waitFor(
    () => fiber.state === state,
    `fiber ${fiber.uid} to reach ${state} (current: ${fiber.state})`,
    timeout,
  );
}

/**
 * Structural helper for writing component literals without fighting the
 * union return type of `Component.apply`.
 */
type ComponentLiteral = {
  inject: Key[];
  provide: Key[];
  apply: (ctx: any, config?: any) => any;
  updateConfig?: (ctx: any, oldConfig: any, newConfig: any) => void;
};

function makeComponent(literal: ComponentLiteral): Component {
  return literal as unknown as Component;
}

/* ------------------------------------------------------------------ *
 * Tests
 * ------------------------------------------------------------------ */

describe('Cordis core semantics', () => {
  it('ctx.effect disposes yielded inverses in LIFO order', async () => {
    const ctx = new Context();
    const events: string[] = [];

    const dispose = ctx.effect(async function* () {
      events.push('apply1');
      yield () => {
        events.push('inverse1');
      };
      events.push('apply2');
      yield () => {
        events.push('inverse2');
      };
    });

    await waitFor(() => events.includes('apply2'), 'both effect steps to run');

    expect(events).toEqual(['apply1', 'apply2']);

    await dispose();

    expect(events).toEqual(['apply1', 'apply2', 'inverse2', 'inverse1']);

    // Disposal is idempotent.
    await dispose();

    expect(events).toEqual(['apply1', 'apply2', 'inverse2', 'inverse1']);
  });

  it('ctx.set installs and removes a coeffect binding', async () => {
    const ctx = new Context();

    const dispose = ctx.set('db', { ready: true });

    expect(ctx.get('db')).toEqual({ ready: true });

    await dispose();

    expect(ctx.get('db')).toBeUndefined();

    // A second disposal is a no-op.
    await dispose();

    expect(ctx.get('db')).toBeUndefined();
  });

  it('ctx.isolate creates independent bindings for the same logical key', () => {
    const ctx = new Context();

    ctx.set('db', { scope: 'root' });

    const ctxA = ctx.isolate('db');
    const ctxB = ctx.isolate('db');

    ctxA.set('db', { scope: 'a' });
    ctxB.set('db', { scope: 'b' });

    expect(ctx.get('db')).toEqual({ scope: 'root' });
    expect(ctxA.get('db')).toEqual({ scope: 'a' });
    expect(ctxB.get('db')).toEqual({ scope: 'b' });
  });

  it('ctx.intercept applies merged metadata to provider functions', () => {
    const ctx = new Context();

    ctx.set('svc', (meta: { level: number }) => ({ level: meta.level }));

    const child = ctx.intercept('svc', { level: 7 });

    expect(child.get('svc')).toEqual({ level: 7 });

    // The root context is not affected by the interception.
    expect(typeof ctx.get('svc')).toBe('function');
  });

  it('fiber starts INACTIVE and becomes ACTIVE when dependencies are provided', async () => {
    const ctx = new Context();

    const consumer = makeComponent({
      inject: ['db'],
      provide: [],
      apply: () => () => {},
    });

    const provider = makeComponent({
      inject: [],
      provide: ['db'],
      apply: (ctx) => {
        const dispose = ctx.set('db', { ready: true });
        return dispose;
      },
    });

    const consumerFiber = ctx.use(consumer, {});

    expect(consumerFiber.state).toBe('INACTIVE');

    const providerFiber = ctx.use(provider, {});

    await waitForState(providerFiber, 'ACTIVE');
    await waitForState(consumerFiber, 'ACTIVE');

    expect(consumerFiber.committed?.get('db')).toBe(providerFiber.uid);
    expect(ctx.get('db')).toEqual({ ready: true });
  });

  it('fiber becomes INACTIVE when a provider is retired', async () => {
    const ctx = new Context();

    const consumer = makeComponent({
      inject: ['db'],
      provide: [],
      apply: () => () => {},
    });

    const provider = makeComponent({
      inject: [],
      provide: ['db'],
      apply: (ctx) => {
        const dispose = ctx.set('db', { ready: true });
        return dispose;
      },
    });

    const consumerFiber = ctx.use(consumer, {});
    const providerFiber = ctx.use(provider, {});

    await waitForState(providerFiber, 'ACTIVE');
    await waitForState(consumerFiber, 'ACTIVE');

    providerFiber.markRetired();

    await waitForState(consumerFiber, 'INACTIVE');
    await waitForState(providerFiber, 'INACTIVE');

    expect(ctx.get('db')).toBeUndefined();
  });

  it('guarded unload: dependents deactivate before provider dispose runs', async () => {
    const ctx = new Context();
    const events: string[] = [];

    const consumer = makeComponent({
      inject: ['db'],
      provide: [],
      apply: (ctx) => {
        const dispose = ctx.effect(() => {
          events.push('consumer-apply');
          return () => {
            events.push('consumer-cleanup');
          };
        });
        return dispose;
      },
    });

    const provider = makeComponent({
      inject: [],
      provide: ['db'],
      apply: (ctx) => {
        const bindingDispose = ctx.set('db', { ok: true });

        const effectDispose = ctx.effect(() => {
          events.push('provider-apply');
          return () => {
            events.push('provider-cleanup');
          };
        });

        // The effect disposer was created after the binding disposer, so
        // LIFO recovery runs it first when the fiber is unloaded.
        return EffectEngine.compose(effectDispose, bindingDispose);
      },
    });

    const consumerFiber = ctx.use(consumer, {});
    const providerFiber = ctx.use(provider, {});

    await waitForState(providerFiber, 'ACTIVE');
    await waitForState(consumerFiber, 'ACTIVE');

    expect(events).toContain('provider-apply');
    expect(events).toContain('consumer-apply');

    providerFiber.markRetired();

    await waitForState(consumerFiber, 'INACTIVE');
    await waitForState(providerFiber, 'INACTIVE');

    const consumerCleanupIndex = events.indexOf('consumer-cleanup');
    const providerCleanupIndex = events.indexOf('provider-cleanup');

    expect(consumerCleanupIndex).toBeGreaterThanOrEqual(0);
    expect(providerCleanupIndex).toBeGreaterThanOrEqual(0);
    expect(consumerCleanupIndex).toBeLessThan(providerCleanupIndex);
  });

  it('failure during activation leaves fiber FAILED and context recovered', async () => {
    const ctx = new Context();

    const failing = makeComponent({
      inject: [],
      provide: ['db'],
      apply: (ctx) => {
        return (async function* () {
          const disposeBinding = ctx.set('db', { partial: true });
          yield disposeBinding;
          throw new Error('activation failed');
        })() as unknown as EffectCallback;
      },
    });

    const fiber = ctx.use(failing, {});

    await waitForState(fiber, 'FAILED');

    expect(fiber.error).toBeInstanceOf(Error);
    expect((fiber.error as Error).message).toBe('activation failed');
    expect(fiber.target).toBeNull();
    expect(fiber.committed).toBeNull();

    // The partial `ctx.set` effect must have been rolled back.
    expect(ctx.get('db')).toBeUndefined();
  });

  it('loader reconciliation creates, removes, and updates fibers by id', async () => {
    const dbPath = path.join(tempDir, 'db.mjs');
    const cmdPath = path.join(tempDir, 'cmd.mjs');
    const adminPath = path.join(tempDir, 'admin.mjs');

    await fs.writeFile(
      dbPath,
      `export default {
        inject: [],
        provide: ['db'],
        apply(ctx, config) {
          const dispose = ctx.set('db', config);
          return dispose;
        },
        updateConfig() {}
      };`,
      'utf8',
    );

    await fs.writeFile(
      cmdPath,
      `export default {
        inject: ['db'],
        provide: [],
        apply(ctx) {
          ctx.get('db');
          return () => {};
        }
      };`,
      'utf8',
    );

    await fs.writeFile(
      adminPath,
      `export default {
        inject: [],
        provide: [],
        apply() {
          return () => {};
        }
      };`,
      'utf8',
    );

    const dbUrl = pathToFileURL(dbPath).href;
    const cmdUrl = pathToFileURL(cmdPath).href;
    const adminUrl = pathToFileURL(adminPath).href;

    const ctx = new Context();
    const loader = new Loader(ctx);

    await loader.reconcile([
      { id: 'db', url: dbUrl, config: { flavor: 'sqlite' } },
      { id: 'cmd', url: cmdUrl },
    ]);

    await waitFor(
      () =>
        loader.entries.get('db')?.fiber?.state === 'ACTIVE' &&
        loader.entries.get('cmd')?.fiber?.state === 'ACTIVE',
      'initial db and cmd fibers to activate',
    );

    const dbFiber = loader.entries.get('db')!.fiber!;
    const cmdFiber = loader.entries.get('cmd')!.fiber!;
    const dbUid = dbFiber.uid;

    expect(cmdFiber.committed?.get('db')).toBe(dbUid);

    await loader.reconcile([
      { id: 'db', url: dbUrl, config: { flavor: 'postgres' } },
      { id: 'admin', url: adminUrl },
    ]);

    await waitFor(
      () => loader.entries.get('admin')?.fiber?.state === 'ACTIVE',
      'admin fiber to activate after reconcile',
    );

    expect(loader.entries.has('cmd')).toBe(false);
    expect(cmdFiber.state === 'INACTIVE' || cmdFiber.state === 'FAILED').toBe(
      true,
    );

    // The db entry's config changed, but its component provides updateConfig,
    // so the fiber is updated in place rather than rebuilt.
    expect(loader.entries.get('db')!.fiber!.uid).toBe(dbUid);
  });

  it('HMR transactional reload rolls back on syntax error', async () => {
    const dbPath = path.join(tempDir, 'db.cjs');
    const cmdPath = path.join(tempDir, 'cmd.cjs');

    await fs.writeFile(
      dbPath,
      `module.exports = {
        inject: [],
        provide: ['db'],
        apply(ctx) {
          const dispose = ctx.set('db', { ok: true });
          return dispose;
        }
      };`,
      'utf8',
    );

    await fs.writeFile(
      cmdPath,
      `module.exports = {
        inject: ['db'],
        provide: [],
        apply(ctx) {
          ctx.get('db');
          return () => {};
        }
      };`,
      'utf8',
    );

    const dbUrl = pathToFileURL(dbPath).href;
    const cmdUrl = pathToFileURL(cmdPath).href;

    const ctx = new Context();
    const loader = new Loader(ctx);

    await loader.reconcile([
      { id: 'db', url: dbUrl },
      { id: 'cmd', url: cmdUrl },
    ]);

    await waitFor(
      () =>
        loader.entries.get('db')?.fiber?.state === 'ACTIVE' &&
        loader.entries.get('cmd')?.fiber?.state === 'ACTIVE',
      'initial fibers to activate for HMR test',
    );

    const dbFiberUid = loader.entries.get('db')!.fiber!.uid;

    // Break the command module source.
    await fs.writeFile(cmdPath, 'this is not valid javascript', 'utf8');

    const hmr = new HMR();
    const stashed = new Set<string>([cmdUrl]);
    const externals = new Set<string>();

    const classification = hmr.classify(stashed, externals);
    const accepted = classification.accepted;
    const declined = classification.declined;

    const staleEntries = hmr.detectStale(
      Array.from(loader.entries.values()),
      accepted,
      declined,
    );

    expect(staleEntries.some((entry) => entry.id === 'cmd')).toBe(true);

    await expect(
      hmr.reload(loader.context, accepted, staleEntries),
    ).rejects.toThrow();

    // The transaction must have rolled back completely.
    await waitFor(
      () => loader.entries.get('cmd')?.fiber?.state === 'ACTIVE',
      'command fiber to be recreated and active after rollback',
    );

    // The database provider was not part of the stale set.
    expect(loader.entries.get('db')!.fiber!.uid).toBe(dbFiberUid);
    expect(loader.entries.get('db')!.fiber!.state).toBe('ACTIVE');
  });
});
