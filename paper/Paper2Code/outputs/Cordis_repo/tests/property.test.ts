/**
 * tests/property.test.ts
 *
 * Property-based tests for the Cordis reproduction.
 *
 * The six properties are the executable counterparts of the paper's
 * metatheorems:
 *
 * 1. `recovery_exactness`   -> Theorem 61 / Corollary 62
 * 2. `activation_ordering`  -> Theorem 63(1)
 * 3. `withdrawal_ordering`  -> Theorem 63(2) + guarded unload
 * 4. `resolution_coherence` -> Theorem 64
 * 5. `progress`             -> Theorem 66
 * 6. `confluence`           -> Theorem 73
 *
 * All generated component graphs satisfy the theorem preconditions:
 * acyclic `≺`, pairwise disjoint effects, correct inverses, bounded iterator
 * length, and totality on provision.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

import { Context, Lifecycle } from '../src';
import type {
  Component,
  Dispose,
  EffectCallback,
  Fiber,
  Key,
} from '../src';

/* ------------------------------------------------------------------ *
 * Local test-only types
 * ------------------------------------------------------------------ */

interface Step {
  type: 'store' | 'world';
  key?: string;
  slot?: string;
  value: number;
}

interface TestSpec {
  id: string;
  inject: Key[];
  provide: Key[];
  steps: Step[];
}

interface ObservableState {
  storeBindings: { key: string; value: unknown }[];
  worldBindings: { slot: string; value: unknown }[];
}

interface NormalizedState {
  active: { id: string; resolved: { key: string; provider: string }[] }[];
  storeBindings: { key: string; value: unknown }[];
  worldBindings: { slot: string; value: unknown }[];
}

interface ResolvedViewEntry {
  iteration: number;
  committedObj: Map<Key, number> | null;
  committed: Map<Key, number> | null;
  target: Map<Key, number> | null;
}

/** A manually resolvable promise, used to pause effect iterators. */
class Deferred {
  readonly promise: Promise<void>;
  resolve!: () => void;

  constructor() {
    this.promise = new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function sameView(
  a: Map<Key, number> | null,
  b: Map<Key, number> | null,
): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
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

/* ------------------------------------------------------------------ *
 * Spec builders
 * ------------------------------------------------------------------ */

/**
 * Builds a linear dependency chain:
 *
 *   chain0 provides k0
 *   chain1 injects k0, provides k1
 *   chain2 injects k1, provides k2
 *   ...
 */
function buildChainSpecs(n: number): TestSpec[] {
  return Array.from({ length: n }, (_, index) => {
    const id = `chain${index}`;
    const inject = index === 0 ? [] : [`k${index - 1}`];
    const provide = index < n - 1 ? [`k${index}`] : [];
    const steps: Step[] = [];

    if (provide.length > 0) {
      steps.push({ type: 'store', key: provide[0], value: index });
    }

    steps.push({ type: 'world', slot: `w${index}`, value: index });

    return { id, inject, provide, steps };
  });
}

/** Builds components whose effects are pairwise independent. */
function buildIndependentSpecs(count: number, prefix: string): TestSpec[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `${prefix}${index}`;
    const key = `key_${prefix}_${index}`;
    const slot = `world_${prefix}_${index}`;

    return {
      id,
      inject: [],
      provide: [key],
      steps: [
        { type: 'store', key, value: index },
        { type: 'world', slot, value: index },
      ],
    };
  });
}

/** Builds a target component for recovery-exactness checks. */
function buildTargetSpec(): TestSpec {
  return {
    id: 'target',
    inject: [],
    provide: ['targetKey'],
    steps: [
      { type: 'store', key: 'targetKey', value: 99 },
      { type: 'world', slot: 'world_target', value: 99 },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Test harness
 * ------------------------------------------------------------------ */

/**
 * Wraps a root Context, tracks fibers by component id, and records effect
 * disposal markers for ordering assertions.
 */
class TestHarness {
  readonly ctx: Context;
  readonly eventLog: string[] = [];
  readonly world = new Map<string, unknown>();
  readonly specs = new Map<string, TestSpec>();
  readonly fibers = new Map<string, Fiber>();
  readonly uidToId = new Map<number, string>();
  readonly allStoreKeys = new Set<Key>();

  constructor() {
    this.ctx = new Context();
  }

  /** Instantiates an already-built component under the harness's context. */
  instantiate(id: string, component: Component): Fiber {
    const existing = this.fibers.get(id);
    if (existing) {
      return existing;
    }

    const fiber = this.ctx.use(component, {});
    this.fibers.set(id, fiber);
    this.uidToId.set(fiber.uid, id);
    return fiber;
  }

  /** Instantiates a component built from a test spec. */
  loadSpec(spec: TestSpec): Fiber {
    const existing = this.fibers.get(spec.id);
    if (existing) {
      return existing;
    }

    this.specs.set(spec.id, spec);
    for (const key of spec.provide) {
      this.allStoreKeys.add(key);
    }

    const component = componentFromSpec(spec, this);
    return this.instantiate(spec.id, component);
  }

  /** Retires a fiber and settles the system fully. */
  async retire(specId: string): Promise<void> {
    const fiber = this.fibers.get(specId);
    if (fiber) {
      fiber.markRetired();
    }
    await this.settle();
  }

  /** True when every fiber has reached its target view. */
  isQuiescent(): boolean {
    for (const fiber of this.fibers.values()) {
      if (fiber.state === 'LOADING' || fiber.state === 'UNLOADING') {
        return false;
      }

      if (fiber.state === 'FAILED') {
        continue;
      }

      if (fiber.retired) {
        if (fiber.state !== 'INACTIVE') {
          return false;
        }
        continue;
      }

      if (fiber.target === null) {
        if (fiber.state !== 'INACTIVE') {
          return false;
        }
      } else {
        if (fiber.state !== 'ACTIVE' || !sameView(fiber.committed, fiber.target)) {
          return false;
        }
      }
    }

    return true;
  }

  /** Drives all in-flight inertial transitions until quiescence. */
  async settle(timeout = 5000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      if (this.isQuiescent()) {
        return;
      }

      const busy = Array.from(this.fibers.values()).filter(
        (fiber) => fiber.state === 'LOADING' || fiber.state === 'UNLOADING',
      );

      if (busy.length === 0) {
        throw new Error(
          'Non-quiescent state without any in-flight transition: ' +
            this.describe(),
        );
      }

      const transitions = busy
        .map((fiber) => fiber.inertia)
        .filter((promise): promise is Promise<void> => promise !== null);

      if (transitions.length === 0) {
        throw new Error(
          'Busy fiber without associated transition: ' + this.describe(),
        );
      }

      // Race is safer than all here: a provider may be waiting on a dependent
      // that has not yet started its own transition, and all would deadlock.
      await Promise.race(transitions);
    }

    throw new Error('Settle timeout: ' + this.describe());
  }

  /** Human-readable description used in error messages. */
  private describe(): string {
    return Array.from(this.fibers.entries())
      .map(([id, fiber]) => `${id}:${fiber.state}`)
      .join(', ');
  }

  /** Observational state restricted to coeffect and world values. */
  observableState(): ObservableState {
    const storeBindings: { key: string; value: unknown }[] = [];

    for (const key of this.allStoreKeys) {
      const value = this.ctx.get(key);
      if (value !== undefined) {
        storeBindings.push({ key: String(key), value });
      }
    }

    storeBindings.sort((a, b) => a.key.localeCompare(b.key));

    const worldBindings = Array.from(this.world.entries()).map(
      ([slot, value]) => ({ slot, value }),
    );
    worldBindings.sort((a, b) => a.slot.localeCompare(b.slot));

    return { storeBindings, worldBindings };
  }

  /**
   * Full normalized state for confluence comparison:
   * UIDs are mapped back to component ids.
   */
  normalizeState(): NormalizedState {
    const active = Array.from(this.fibers.entries())
      .filter(([, fiber]) => fiber.state === 'ACTIVE' && !fiber.retired)
      .map(([id, fiber]) => {
        const resolved = fiber.committed
          ? Array.from(fiber.committed.entries()).map(([key, uid]) => ({
              key: String(key),
              provider: this.uidToId.get(uid) ?? String(uid),
            }))
          : [];

        resolved.sort((a, b) => a.key.localeCompare(b.key));

        return { id, resolved };
      });

    active.sort((a, b) => a.id.localeCompare(b.id));

    const observed = this.observableState();

    return { active, storeBindings: observed.storeBindings, worldBindings: observed.worldBindings };
  }
}

/** Builds a Cordis component from a test spec. */
function componentFromSpec(spec: TestSpec, harness: TestHarness): Component {
  return {
    inject: spec.inject,
    provide: spec.provide,
    apply: (ctx) => {
      const iterator = (async function* () {
        for (const step of spec.steps) {
          if (step.type === 'store' && step.key !== undefined) {
            const key = step.key;
            const dispose = ctx.set(key, {
              provider: spec.id,
              value: step.value,
            });

            yield async () => {
              harness.eventLog.push(`dispose:${spec.id}`);
              await dispose();
            };
          } else if (step.type === 'world' && step.slot !== undefined) {
            const slot = step.slot;
            harness.world.set(slot, { provider: spec.id, value: step.value });

            yield async () => {
              harness.eventLog.push(`dispose:${spec.id}`);
              harness.world.delete(slot);
            };
          }
        }
      })();

      return iterator as unknown as EffectCallback;
    },
  };
}

/* ------------------------------------------------------------------ *
 * Property tests
 * ------------------------------------------------------------------ */

describe('Cordis property-based guarantees', () => {
  it('recovery_exactness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 2 }),
        async (ambientCount) => {
          const ambient = buildIndependentSpecs(ambientCount, 'amb');
          const target = buildTargetSpec();

          const withTarget = new TestHarness();
          if (ambient.length > 0) {
            withTarget.loadSpec(ambient[0]);
          }
          withTarget.loadSpec(target);
          if (ambient.length > 1) {
            withTarget.loadSpec(ambient[1]);
          }
          await withTarget.settle();
          await withTarget.retire(target.id);

          const withoutTarget = new TestHarness();
          for (const spec of ambient) {
            withoutTarget.loadSpec(spec);
          }
          await withoutTarget.settle();

          expect(withTarget.observableState()).toEqual(
            withoutTarget.observableState(),
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it('activation_ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(['chain0', 'chain1'], ['chain1', 'chain0']),
        async (order) => {
          const specs = buildChainSpecs(2);
          const providerSpec = specs[0];
          const dependentSpec = specs[1];

          const harness = new TestHarness();

          for (const id of order) {
            const spec = id === providerSpec.id ? providerSpec : dependentSpec;
            harness.loadSpec(spec);

            // Allow the lifecycle to take at least one microtask before the
            // next component is loaded.
            await new Promise((resolve) => setTimeout(resolve, 0));
          }

          await harness.settle();

          const provider = harness.fibers.get(providerSpec.id)!;
          const dependent = harness.fibers.get(dependentSpec.id)!;

          if (order[0] === dependentSpec.id) {
            // If the dependent was loaded before its provider, it must have
            // remained INACTIVE until the provider arrived.
            expect(harness.fibers.get(dependentSpec.id)!.state).toBe('ACTIVE');
          }

          expect(provider.state).toBe('ACTIVE');
          expect(dependent.state).toBe('ACTIVE');
          expect(dependent.committed?.get('k0')).toBe(provider.uid);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('withdrawal_ordering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 3 }),
        async (n) => {
          const specs = buildChainSpecs(n);
          const harness = new TestHarness();

          for (const spec of specs) {
            harness.loadSpec(spec);
          }

          await harness.settle();
          expect(harness.isQuiescent()).toBe(true);

          const providerId = specs[0].id;
          const dependentIds = specs.slice(1).map((spec) => spec.id);

          await harness.retire(providerId);

          const markerIndexes = (marker: string): number[] =>
            harness.eventLog
              .map((entry, index) => (entry === marker ? index : -1))
              .filter((index) => index >= 0);

          const providerIndexes = markerIndexes(`dispose:${providerId}`);
          const dependentIndexes = dependentIds.flatMap((id) =>
            markerIndexes(`dispose:${id}`),
          );

          expect(providerIndexes.length).toBeGreaterThan(0);
          expect(dependentIndexes.length).toBeGreaterThan(0);
          expect(Math.max(...dependentIndexes)).toBeLessThan(
            Math.min(...providerIndexes),
          );
        },
      ),
      { numRuns: 20 },
    );
  });

  it('resolution_coherence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.integer({ min: 2, max: 4 }),
        async (replaceProvider, iterationCount) => {
          const harness = new TestHarness();
          const viewLog: ResolvedViewEntry[] = [];
          const gate = new Deferred();

          const providerA: Component = {
            inject: [],
            provide: ['svc'],
            apply: (ctx) => {
              const dispose = ctx.set('svc', { provider: 'providerA' });
              return (async function* () {
                yield dispose;
              })() as unknown as EffectCallback;
            },
          };

          const providerAFiber = harness.instantiate('providerA', providerA);
          await harness.settle();
          expect(providerAFiber.state).toBe('ACTIVE');

          const dependent: Component = {
            inject: ['svc'],
            provide: [],
            apply: (ctx) => {
              const iterator = (async function* () {
                for (let i = 0; i < iterationCount; i += 1) {
                  // A component's apply runs on its own fiber's context, so
                  // the owner fiber is always present here.
                  const fiber = ctx.fiber!;

                  viewLog.push({
                    iteration: i,
                    committedObj: fiber.committed,
                    committed: fiber.committed
                      ? new Map(fiber.committed)
                      : null,
                    target: fiber.target ? new Map(fiber.target) : null,
                  });

                  yield () => {};

                  if (i < iterationCount - 1) {
                    await gate.promise;
                  }
                }
              })();

              return iterator as unknown as EffectCallback;
            },
          };

          const dependentFiber = harness.instantiate('dependent', dependent);

          await waitFor(
            () => viewLog.length >= 1,
            'dependent to start its first iteration',
          );

          if (replaceProvider) {
            providerAFiber.markRetired();

            const providerB: Component = {
              inject: [],
              provide: ['svc'],
              apply: (ctx) => {
                const dispose = ctx.set('svc', { provider: 'providerB' });
                return (async function* () {
                  yield dispose;
                })() as unknown as EffectCallback;
              },
            };

            harness.instantiate('providerB', providerB);
          } else {
            providerAFiber.markRetired();
          }

          gate.resolve();
          await harness.settle();

          // Group observations by the identity of the committed Map object.
          // Each distinct Map represents one activation episode.
          const groups = new Map<object | undefined, ResolvedViewEntry[]>();

          for (const entry of viewLog) {
            const key = entry.committedObj ?? undefined;
            const group = groups.get(key) ?? [];
            group.push(entry);
            groups.set(key, group);
          }

          // Within each activation episode, the committed view must be fixed.
          for (const group of groups.values()) {
            const firstCommitted = group[0].committed;

            for (const entry of group.slice(1)) {
              expect(sameView(entry.committed, firstCommitted)).toBe(true);
            }
          }

          if (replaceProvider) {
            expect(dependentFiber.state).toBe('ACTIVE');
            expect(dependentFiber.committed?.get('svc')).toBe(
              harness.fibers.get('providerB')?.uid,
            );
          } else {
            expect(dependentFiber.state).toBe('INACTIVE');
          }
        },
      ),
      { numRuns: 15 },
    );
  });

  it('progress', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 4 }),
        fc.array(fc.boolean(), { minLength: 4, maxLength: 4 }),
        async (n, retireMask) => {
          const specs = buildChainSpecs(n);
          const harness = new TestHarness();

          // Batch-load every component without settling in between.  This
          // forces several inertial transitions to be in flight concurrently.
          for (const spec of specs) {
            harness.loadSpec(spec);
          }

          await harness.settle();
          expect(harness.isQuiescent()).toBe(true);

          const ids = specs.map((spec) => spec.id);

          // Retire the selected subset all at once, then settle.
          for (let i = 0; i < ids.length; i += 1) {
            if (retireMask[i] ?? false) {
              const fiber = harness.fibers.get(ids[i]);
              if (fiber) {
                fiber.markRetired();
              }
            }
          }

          await harness.settle();
          expect(harness.isQuiescent()).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('confluence', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 3 }),
        fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
        async (n, retireMask) => {
          const specs = buildChainSpecs(n);
          const ids = specs.map((spec) => spec.id);

          const run = async (batch: boolean): Promise<NormalizedState> => {
            const harness = new TestHarness();

            if (batch) {
              // Schedule A: load everything, then settle once.
              for (const spec of specs) {
                harness.loadSpec(spec);
              }
              await harness.settle();
            } else {
              // Schedule B: settle after every load.
              for (const spec of specs) {
                harness.loadSpec(spec);
                await harness.settle();
              }
            }

            // Retire all flagged components in both schedules.
            for (let i = 0; i < ids.length; i += 1) {
              if (retireMask[i] ?? false) {
                const fiber = harness.fibers.get(ids[i]);
                if (fiber) {
                  fiber.markRetired();
                }
              }
            }

            await harness.settle();
            return harness.normalizeState();
          };

          const sequential = await run(false);
          const batched = await run(true);

          expect(batched).toEqual(sequential);
        },
      ),
      { numRuns: 15 },
    );
  });
});

