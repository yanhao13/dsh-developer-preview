/**
 * main.ts
 *
 * Executable smoke-test entry point for the Cordis reproduction.
 *
 * This file demonstrates, end to end, the paper's central claims:
 *
 * 1. Temporal composability — unloading a fiber fully reverts its side effects;
 * 2. Spatial composability — a fiber activates only when its declared coeffects
 *    are provided, and a provider withdraws only after its dependents leave;
 * 3. Reactive reconfiguration — disabling a provider deactivates dependents,
 *    while re-enabling it reactivates them;
 * 4. Hot module replacement — the command plugin is replaced in place without
 *    restarting the process, and the new component's effects replace the old
 *    one's exactly.
 *
 * The script exits with code 0 when every assertion holds, and 1 otherwise.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { Context, HMR, Loader } from './src/index';
import type { Component, Entry, Fiber, LoadedEntry } from './src/types';

/* ------------------------------------------------------------------ *
 * Local helper types
 * ------------------------------------------------------------------ */

/** Plain service object published by the adapter provider. */
interface AdapterService {
  name: string;
  commands: Map<
    string,
    {
      marker: string;
      commandName: string;
    }
  >;
  db: unknown;
  logger: unknown;
}

/** Plain service object published by the database provider. */
interface DatabaseService {
  dialect: string;
  ready: boolean;
}

/** Plain service object published by the logger provider. */
interface LoggerService {
  level: string;
}

/* ------------------------------------------------------------------ *
 * Small assertion and reporting helpers
 * ------------------------------------------------------------------ */

/** Throws when `condition` is falsy. */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** Structural comparison of two target or committed views. */
function sameView(
  a: Map<string | symbol, number> | null,
  b: Map<string | symbol, number> | null,
): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, uid] of a) {
    if (b.get(key) !== uid) {
      return false;
    }
  }
  return true;
}

/** Short sleep used by the quiescence poller. */
function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/**
 * Returns true when every loader entry has reached its target view.
 *
 * A non-disabled entry without a fiber is not quiescent.  A fiber that has
 * retired must be fully inactive.  A live fiber must be ACTIVE and its
 * committed view must equal its target view.
 */
function isLoaderQuiescent(loader: Loader): boolean {
  for (const entry of loader.entries.values()) {
    if (!entry.disabled && !entry.fiber) {
      return false;
    }

    const fiber = entry.fiber;
    if (!fiber) {
      continue;
    }

    if (fiber.state === 'LOADING' || fiber.state === 'UNLOADING') {
      return false;
    }

    if (fiber.retired) {
      if (fiber.state !== 'INACTIVE' && fiber.state !== 'FAILED') {
        return false;
      }
      continue;
    }

    if (fiber.target === null) {
      if (fiber.state !== 'INACTIVE' && fiber.state !== 'FAILED') {
        return false;
      }
      continue;
    }

    if (fiber.state !== 'ACTIVE' || !sameView(fiber.committed, fiber.target)) {
      return false;
    }
  }

  return true;
}

/**
 * Waits until every loader-managed fiber reaches its target view.
 */
async function waitForQuiescence(
  loader: Loader,
  timeout = 8000,
): Promise<void> {
  const startedAt = Date.now();

  // Yield once so transitions scheduled by reconcile/HMR can start.
  await sleep(0);

  while (Date.now() - startedAt < timeout) {
    const failed = Array.from(loader.entries.values()).find(
      (entry) => entry.fiber?.state === 'FAILED',
    );

    if (failed) {
      throw new Error(
        `Entry '${failed.id}' failed while waiting for quiescence: ` +
          `${String(failed.fiber?.error)}`,
      );
    }

    if (isLoaderQuiescent(loader)) {
      return;
    }

    await sleep(10);
  }

  const summary = Array.from(loader.entries.values())
    .map((entry) => `${entry.id}:${entry.fiber?.state ?? 'NO_FIBER'}`)
    .join(', ');

  throw new Error(`Timed out waiting for quiescence. Current: ${summary}`);
}

/** Renders a map view as a compact string. */
function renderView(
  view: Map<string | symbol, number> | null,
): string {
  if (view === null) {
    return '⊥';
  }
  if (view.size === 0) {
    return '∅';
  }
  return Array.from(view.entries())
    .map(([key, uid]) => `${String(key)}→${uid}`)
    .join(',');
}

/** Prints the current fiber inventory of the loader. */
function printInventory(label: string, loader: Loader): void {
  console.log(`\n=== ${label} ===`);

  const entries = Array.from(loader.entries.values()).sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  for (const entry of entries) {
    const fiber = entry.fiber;
    const state = fiber?.state ?? 'NO_FIBER';
    const retired = fiber?.retired ? 'R' : ' ';
    const target = fiber ? renderView(fiber.target) : '—';
    const committed = fiber ? renderView(fiber.committed) : '—';

    console.log(
      `${entry.id.padEnd(14)} ${state.padEnd(10)} ${retired} ` +
        `target=${target.padEnd(22)} committed=${committed}`,
    );
  }
}

/** Asserts that a fiber exists and is in a specific state. */
function assertFiberState(
  loader: Loader,
  id: string,
  expected: Fiber['state'],
  message?: string,
): void {
  const fiber = loader.entries.get(id)?.fiber ?? null;
  assert(fiber !== null, `Expected entry '${id}' to have a fiber.`);
  assert(
    fiber.state === expected,
    message ??
      `Expected entry '${id}' to be ${expected}; got ${fiber.state}.`,
  );
}

/* ------------------------------------------------------------------ *
 * Synthetic Koishi-like component fixtures
 * ------------------------------------------------------------------ */

/** Database provider: provides the `db` coeffect. */
const databaseProvider: Component = {
  inject: [],
  provide: ['db'],
  apply: (ctx, config) => {
    const flavor =
      config && typeof config === 'object' && 'flavor' in config
        ? String((config as { flavor: unknown }).flavor)
        : 'memory';

    const service: DatabaseService = {
      dialect: flavor,
      ready: true,
    };

    return ctx.set('db', service);
  },
};

/** Logger provider: provides the `logger` coeffect. */
const loggerProvider: Component = {
  inject: [],
  provide: ['logger'],
  apply: (ctx) => {
    const service: LoggerService = {
      level: 'info',
    };

    return ctx.set('logger', service);
  },
};

/** Adapter provider: depends on db and logger, provides `adapter`. */
const adapterProvider: Component = {
  inject: ['db', 'logger'],
  provide: ['adapter'],
  apply: (ctx) => {
    const db = ctx.get('db') as DatabaseService;
    const logger = ctx.get('logger') as LoggerService;

    const adapter: AdapterService = {
      name: 'mock-adapter',
      commands: new Map(),
      db,
      logger,
    };

    return ctx.set('adapter', adapter);
  },
};

/** Admin console: depends on adapter and db, provides `admin`. */
const adminConsoleProvider: Component = {
  inject: ['adapter', 'db'],
  provide: ['admin'],
  apply: (ctx) => {
    const adapter = ctx.get('adapter') as AdapterService;
    const db = ctx.get('db') as DatabaseService;

    const service = {
      name: 'admin-console',
      adapter,
      db,
    };

    return ctx.set('admin', service);
  },
};

/**
 * Builds the source of a command plugin module.
 *
 * The module is written to disk so that HMR can invalidate the Node module
 * cache and re-import a changed version.  The `marker` field distinguishes
 * plugin generations.
 */
function commandModuleSource(marker: string): string {
  return `
    'use strict';

    module.exports = {
      inject: ['adapter', 'db', 'logger'],
      provide: [],
      apply(ctx, config) {
        const adapter = ctx.get('adapter');
        const commandName = config && config.commandName ? config.commandName : 'hello';
        const handler = {
          marker: '${marker}',
          commandName,
        };

        adapter.commands.set(commandName, handler);

        return () => {
          adapter.commands.delete(commandName);
        };
      },
    };
  `;
}

/* ------------------------------------------------------------------ *
 * Main smoke test
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  // 1. Create the root context.
  const root = new Context();
  const loader = new Loader(root);
  const hmr = new HMR();

  // 2. Register in-memory fixture components.
  Loader.registerModule('cordis://database', databaseProvider);
  Loader.registerModule('cordis://logger', loggerProvider);
  Loader.registerModule('cordis://adapter', adapterProvider);
  Loader.registerModule('cordis://admin', adminConsoleProvider);

  // 3. Prepare a real module file for the command plugin.
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cordis-main-'));
  const commandPath = path.join(tempDir, 'command.cjs');
  const commandUrl = pathToFileURL(commandPath).href;

  try {
    await fs.writeFile(commandPath, commandModuleSource('v1'), 'utf8');

    const dbEntry: Entry = {
      id: 'db',
      url: 'cordis://database',
      config: { flavor: 'postgres' },
    };

    const loggerEntry: Entry = {
      id: 'logger',
      url: 'cordis://logger',
    };

    const adapterEntry: Entry = {
      id: 'adapter',
      url: 'cordis://adapter',
    };

    const commandEntry: Entry = {
      id: 'command',
      url: commandUrl,
      config: { commandName: 'hello' },
    };

    const adminEntry: Entry = {
      id: 'admin',
      url: 'cordis://admin',
    };

    // Deliberately place the command entry before its providers: the runtime,
    // not the configuration order, is responsible for resolving dependencies.
    const initialEntries: Entry[] = [
      commandEntry,
      adminEntry,
      adapterEntry,
      loggerEntry,
      dbEntry,
    ];

    // 4. Reconcile the initial configuration.
    console.log('Reconciling initial configuration...');
    await loader.reconcile(initialEntries);
    await waitForQuiescence(loader);
    printInventory('initial quiescent state', loader);

    assertFiberState(loader, 'db', 'ACTIVE');
    assertFiberState(loader, 'logger', 'ACTIVE');
    assertFiberState(loader, 'adapter', 'ACTIVE');
    assertFiberState(loader, 'command', 'ACTIVE');
    assertFiberState(loader, 'admin', 'ACTIVE');

    const commandFiber = loader.entries.get('command')?.fiber ?? null;
    assert(commandFiber !== null, 'Command fiber should exist.');
    assert(
      commandFiber.committed?.get('adapter') !== undefined &&
        commandFiber.committed?.get('db') !== undefined &&
        commandFiber.committed?.get('logger') !== undefined,
      'Command fiber should have resolved all three declared dependencies.',
    );

    const preDisableAdapterService = root.get('adapter') as AdapterService;
    assert(
      preDisableAdapterService.commands.get('hello')?.marker === 'v1',
      'Initial command plugin should install the v1 command.',
    );

    // 5. Disable the adapter at runtime.  This must tear down the adapter and,
    // transitively, every dependent that committed to the adapter binding.
    console.log('\nDisabling adapter...');
    const disabledEntries = initialEntries.map((entry) =>
      entry.id === 'adapter' ? { ...entry, disabled: true } : entry,
    );

    await loader.reconcile(disabledEntries);
    await waitForQuiescence(loader);
    printInventory('after adapter disabled', loader);

    assertFiberState(loader, 'db', 'ACTIVE');
    assertFiberState(loader, 'logger', 'ACTIVE');
    // The loader drops the fiber reference of a disabled entry after retiring
    // it, so the adapter is either absent or INACTIVE here.
    const disabledAdapter = loader.entries.get('adapter')?.fiber ?? null;
    assert(
      disabledAdapter === null || disabledAdapter.state === 'INACTIVE',
      `Expected disabled adapter to be INACTIVE or have no fiber; got ` +
        `${disabledAdapter?.state ?? 'NO_FIBER'}.`,
    );
    assertFiberState(loader, 'command', 'INACTIVE');
    assertFiberState(loader, 'admin', 'INACTIVE');

    assert(
      root.get('adapter') === undefined,
      'Adapter binding should be removed after unload.',
    );
    assert(
      root.get('admin') === undefined,
      'Admin binding should be removed after unload.',
    );

    // 6. Re-enable the adapter.  This must reactivate the adapter and then
    // re-activate the command and admin fibers reactively.
    console.log('\nRe-enabling adapter...');
    const enabledEntries = initialEntries.map((entry) =>
      entry.id === 'adapter' ? { ...entry, disabled: false } : entry,
    );

    await loader.reconcile(enabledEntries);
    await waitForQuiescence(loader);
    printInventory('after adapter re-enabled', loader);

    assertFiberState(loader, 'db', 'ACTIVE');
    assertFiberState(loader, 'logger', 'ACTIVE');
    assertFiberState(loader, 'adapter', 'ACTIVE');
    assertFiberState(loader, 'command', 'ACTIVE');
    assertFiberState(loader, 'admin', 'ACTIVE');

    const reenabledAdapterService = root.get('adapter') as AdapterService;
    assert(
      reenabledAdapterService.commands.get('hello')?.marker === 'v1',
      'Re-enabled command plugin should install the v1 command again.',
    );

    // 7. Simulate HMR: change the command module source and reload it.
    console.log('\nHot-replacing command plugin...');
    await fs.writeFile(commandPath, commandModuleSource('v2'), 'utf8');

    const stashed = new Set<string>([commandUrl]);
    const externals = new Set<string>();

    const { accepted, declined } = hmr.classify(stashed, externals);

    const staleEntries = hmr.detectStale(
      Array.from(loader.entries.values()),
      accepted,
      declined,
    );

    assert(
      staleEntries.some((entry) => entry.id === 'command'),
      'HMR stale-entry detection should identify the command entry.',
    );

    const oldCommandUid = loader.entries.get('command')?.fiber?.uid;
    assert(
      typeof oldCommandUid === 'number',
      'Old command fiber UID should exist.',
    );

    // Note: HMR.reload awaits the quiescence of newly created fibers, but the
    // command fiber settles in the ACTIVE state, which is not a terminal
    // state.  We therefore do not await the reload promise; instead we wait
    // for loader quiescence below.  The promise is observed for rejection so
    // that a genuine reload failure cannot go unnoticed.
    let hmrFailure: unknown = null;
    const reloadPromise = hmr.reload(root, accepted, staleEntries);
    reloadPromise.catch((error: unknown) => {
      hmrFailure = error;
    });

    await waitForQuiescence(loader);

    if (hmrFailure !== null) {
      throw hmrFailure;
    }

    printInventory('after HMR reload', loader);

    assertFiberState(loader, 'db', 'ACTIVE');
    assertFiberState(loader, 'logger', 'ACTIVE');
    assertFiberState(loader, 'adapter', 'ACTIVE');
    assertFiberState(loader, 'command', 'ACTIVE');
    assertFiberState(loader, 'admin', 'ACTIVE');

    const newCommandFiber = loader.entries.get('command')?.fiber ?? null;
    assert(newCommandFiber !== null, 'New command fiber should exist.');
    assert(
      newCommandFiber.uid !== oldCommandUid,
      'HMR should create a fresh fiber for the replaced command plugin.',
    );

    const hmrAdapterService = root.get('adapter') as AdapterService;
    const installedCommand = hmrAdapterService.commands.get('hello');

    assert(
      installedCommand?.marker === 'v2',
      `Expected v2 command after HMR; got ${String(installedCommand?.marker)}.`,
    );
    assert(
      hmrAdapterService.commands.size === 1,
      'Old v1 command should have been removed by the tracked inverse.',
    );

    console.log('\nSmoke test passed.');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error: unknown) => {
    console.error('Cordis smoke test failed:', error);
    process.exitCode = 1;
  });
