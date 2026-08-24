/**
 * src/loader.ts
 *
 * Declarative component loader with configuration reconciliation and managed
 * isolation realms (Section 5.2 of the paper).
 *
 * The loader is the orchestrator-facing layer.  It translates a declarative
 * `Entry` tree into `Fiber` instances on a root `Context`, keeps the running
 * system in step with configuration changes, and implements the realm
 * reassignment algorithm of Algorithm 7.
 *
 * Configuration keys honoured from `config.yaml`:
 *
 * - `loader.reconciliationKey: id`
 * - `loader.fieldDispatch.url/id: rebuild`
 * - `loader.fieldDispatch.disabled: unload-or-reload`
 * - `loader.fieldDispatch.isolate: patchIsolation`
 * - `loader.fieldDispatch.intercept: updateInPlace`
 * - `loader.fieldDispatch.config: componentHandles`
 * - `loader.managedRealms.delimiterPerKey: true`
 * - `loader.managedRealms.localRealmTag: entry.id`
 * - `loader.managedRealms.globalRealmTag: named-string`
 * - `loader.groupComponents`
 */

import { Context as RuntimeContext } from './context';
import { Lifecycle } from './lifecycle';
import type {
  Change,
  Component,
  Dispose,
  EffectCallback,
  Entry,
  Fiber,
  Key,
  LoadedEntry,
  Metadata,
  Realm,
  Context as IContext,
} from './types';

/* ------------------------------------------------------------------ *
 * Small structural helpers
 * ------------------------------------------------------------------ */

/** Normalizes a key into a stable string for realm-cache keys. */
function stringifyKey(key: Key): string {
  if (typeof key === 'symbol') {
    return key.description ?? key.toString();
  }
  return key;
}

/** Structural deep-equality for configuration-like values. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return false;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    return a.every((value, index) => deepEqual(value, b[index]));
  }

  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(bRecord, key) &&
      deepEqual(aRecord[key], bRecord[key]),
  );
}

/** Structural equality for `Map<Key, unknown>` values. */
function mapsEqual(a: Map<Key, unknown>, b: Map<Key, unknown>): boolean {
  if (a.size !== b.size) {
    return false;
  }

  for (const [key, value] of a) {
    if (!b.has(key) || !deepEqual(b.get(key), value)) {
      return false;
    }
  }

  return true;
}

/** Converts an `Entry.intercept` record into a `Map<Key, Metadata>`. */
function recordToInterceptMap(
  record?: Record<string, Metadata>,
): Map<Key, Metadata> {
  const map = new Map<Key, Metadata>();

  if (record) {
    for (const [key, value] of Object.entries(record)) {
      map.set(key, value);
    }
  }

  return map;
}

/** Compares two `Entry` objects for reconciliation purposes. */
function entriesEqual(a: Entry, b: Entry): boolean {
  if (a.id !== b.id || a.url !== b.url) {
    return false;
  }
  if (!!a.disabled !== !!b.disabled) {
    return false;
  }
  if (!deepEqual(a.config, b.config)) {
    return false;
  }
  if (!deepEqual(a.isolate ?? false, b.isolate ?? false)) {
    return false;
  }
  if (!deepEqual(a.intercept ?? {}, b.intercept ?? {})) {
    return false;
  }
  if (!deepEqual(a.children ?? [], b.children ?? [])) {
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Managed isolation realms
 * ------------------------------------------------------------------ */

/**
 * Deterministic per-entry local realm cache.
 *
 * Two calls with the same `(entryId, key)` produce the same realm symbol, so
 * diffing and reconciliation remain stable across recomputations.
 */
const localRealmCache = new Map<string, Realm>();

/** Deterministic per-scope global realm cache. */
const globalRealmCache = new Map<string, Realm>();

/** Builds the local realm for an entry-local isolate annotation. */
function localRealm(entryId: string, key: Key): Realm {
  const cacheKey = `local:${entryId}:${stringifyKey(key)}`;
  let realm = localRealmCache.get(cacheKey);

  if (!realm) {
    realm = Symbol(`cordis:local:${entryId}:${stringifyKey(key)}`);
    localRealmCache.set(cacheKey, realm);
  }

  return realm;
}

/** Builds the global realm for a named-string isolate annotation. */
function globalRealm(scope: string, key: Key): Realm {
  const cacheKey = `global:${scope}:${stringifyKey(key)}`;
  let realm = globalRealmCache.get(cacheKey);

  if (!realm) {
    realm = Symbol(`cordis:global:${scope}:${stringifyKey(key)}`);
    globalRealmCache.set(cacheKey, realm);
  }

  return realm;
}

/**
 * Computes the desired isolation map for an entry based on its `isolate`
 * annotation and the component's declared inject/provide keys.
 *
 * - `isolate === true` -> local realm per `entry.id`
 * - `isolate` is a non-empty string -> global realm per that string
 * - otherwise -> the key itself is the realm (shared default)
 */
function buildIsolationMap(
  entry: Entry,
  component: Component | null,
): Map<Key, Realm> {
  const keys = new Set<Key>();

  if (component) {
    for (const key of component.inject) {
      keys.add(key);
    }
    for (const key of component.provide) {
      keys.add(key);
    }
  }

  const map = new Map<Key, Realm>();

  for (const key of keys) {
    if (entry.isolate === true) {
      map.set(key, localRealm(entry.id, key));
    } else if (typeof entry.isolate === 'string' && entry.isolate.length > 0) {
      map.set(key, globalRealm(entry.isolate, key));
    } else {
      map.set(key, key);
    }
  }

  return map;
}

/* ------------------------------------------------------------------ *
 * Delimiter tags (`δ_k`)
 * ------------------------------------------------------------------ */

/**
 * Per-context delimiter tags.
 *
 * Tags are inherited through the context parent chain, so a context derived
 * from an entry's fiber context sees the entry's fresh tag.  This makes the
 * `own(γ')` test of Algorithm 7 implementable without changing the core
 * context class.
 */
const delimiterTags = new WeakMap<RuntimeContext, Map<Key, symbol>>();

/** Sets a delimiter tag on a context. */
function setTag(ctx: RuntimeContext, key: Key, tag: symbol): void {
  let map = delimiterTags.get(ctx);
  if (!map) {
    map = new Map<Key, symbol>();
    delimiterTags.set(ctx, map);
  }
  map.set(key, tag);
}

/** Reads a delimiter tag, walking up the context-parent chain. */
function getTag(ctx: RuntimeContext, key: Key): symbol | undefined {
  let current: RuntimeContext | null = ctx;

  while (current) {
    const map = delimiterTags.get(current);
    const tag = map?.get(key);
    if (tag !== undefined) {
      return tag;
    }
    current = current.parent as RuntimeContext | null;
  }

  return undefined;
}

/* ------------------------------------------------------------------ *
 * Loaded entry runtime record
 * ------------------------------------------------------------------ */

/**
 * Runtime state attached to one loaded configuration entry.
 *
 * This is the implementation of the `LoadedEntry` interface from `types.ts`.
 * It tracks the component module, the current fiber, and the realized
 * isolation / interception scopes.
 */
export class LoadedEntryRecord implements LoadedEntry {
  id: string;
  url: string;
  config: any;
  disabled: boolean;
  fiber: Fiber | null;
  isolate: Map<Key, Realm>;
  intercept: Map<Key, Metadata>;

  /** Imported component module, when known. */
  component: Component | null = null;

  /** Original `Entry.isolate` annotation, kept for diffing. */
  isolateAnnotation: boolean | string | undefined;

  /** Original child entries, kept for diffing and group components. */
  children: Entry[] | undefined;

  constructor(
    private readonly loader: Loader,
    entry: Entry,
  ) {
    this.id = entry.id;
    this.url = entry.url;
    this.config = entry.config;
    this.disabled = !!entry.disabled;
    this.fiber = null;
    this.isolate = new Map<Key, Realm>();
    this.intercept = new Map<Key, Metadata>();
    this.isolateAnnotation = entry.isolate;
    this.children = entry.children;
  }

  /**
   * Applies a new configuration payload.
   *
   * The paper delegates the decision to the component.  If the component
   * exposes an `updateConfig` hook, it is used; otherwise the fiber is rebuilt
   * from the same module.  Rebuilding is always sound by the confluence
   * theorem (Theorem 73).
   */
  async applyConfig(config: any): Promise<void> {
    if (deepEqual(this.config, config)) {
      return;
    }

    const oldConfig = this.config;
    this.config = config;

    if (!this.fiber || this.disabled) {
      return;
    }

    const component = this.component;

    if (
      component &&
      typeof (component as unknown as { updateConfig?: unknown }).updateConfig ===
        'function'
    ) {
      await (component as unknown as {
        updateConfig(ctx: IContext, oldConfig: any, newConfig: any): void | Promise<void>;
      }).updateConfig(this.fiber.ctx, oldConfig, config);
      return;
    }

    await this.loader.rebuildLoaded(this, component);
  }
}

/* ------------------------------------------------------------------ *
 * Built-in group component
 * ------------------------------------------------------------------ */

/**
 * Internal group component used for `Entry.children`.
 *
 * It realises the `@cordisjs/group` / `@cordisjs/include` pattern: a group
 * component's activation loads each child as a fiber under the group fiber's
 * context, and unloading the group retires every child.
 *
 * Each child creation is yielded as a separate inverse, so a group activation
 * interrupted part-way rolls back only the children already created.
 */
class GroupComponent implements Component {
  readonly inject: Key[] = [];
  readonly provide: Key[] = [];

  constructor(
    private readonly loader: Loader,
    private readonly children: Entry[],
  ) {}

  apply(ctx: IContext): EffectCallback {
    const loader = this.loader;
    const children = this.children;

    return async function* () {
      for (const child of children) {
        const component = await loader.importComponent(child.url);
        const fiber = ctx.use(component, child.config);

        loader.trackFiber(fiber);
        loader.applyScopes(
          fiber,
          loader.computeDesiredIsolation(child, component),
          child.intercept,
        );
        fiber.refresh();

        const retire = (): Promise<void> => {
          fiber.markRetired();
          return fiber.awaitQuiescence();
        };

        yield retire;
      }
    };
  }
}

/* ------------------------------------------------------------------ *
 * Loader
 * ------------------------------------------------------------------ */

/**
 * The declarative component loader.
 *
 * The loader owns a root `Context`, a map of loaded entries keyed by
 * `Entry.id`, and all fibers it has realised.  It performs keyed
 * reconciliation, field-level dispatch, and managed isolation reassignment.
 */
export class Loader {
  /** User-registered component modules for tests and virtual entries. */
  static readonly moduleRegistry = new Map<string, Component>();

  /** Registers a component module under a URL, bypassing dynamic import. */
  static registerModule(url: string, component: Component): void {
    Loader.moduleRegistry.set(url, component);
  }

  /** Removes a registered component module. */
  static unregisterModule(url: string): void {
    Loader.moduleRegistry.delete(url);
  }

  /** Root context on which all loader-managed fibers are instantiated. */
  readonly context: RuntimeContext;

  /** Loaded entries keyed by reconciliation key (`Entry.id`). */
  readonly entries = new Map<string, LoadedEntry>();

  /** All fibers tracked by this loader, including group children. */
  private readonly trackedFibers = new Set<Fiber>();

  /** Creates a loader bound to a root context. */
  constructor(context: RuntimeContext) {
    this.context = context;
  }

  /**
   * Reconciles a full configuration list.
   *
   * The configuration is diffed against the current loaded entries and each
   * change is applied through `applyChange`.
   */
  async reconcile(entries: Entry[]): Promise<void> {
    const current = Array.from(this.entries.values(), (entry) =>
      this.loadedToEntry(entry),
    );

    const changes = this.diffEntries(current, entries);

    for (const change of changes) {
      if (change.type === 'remove') {
        const loaded = this.entries.get(change.entry.id) ?? change.oldEntry;
        if (loaded) {
          await this.removeEntry(loaded);
        }
      } else {
        await this.applyChange(change.entry);
      }
    }
  }

  /**
   * Computes a keyed diff by `Entry.id`.
   */
  diffEntries(oldEntries: Entry[], newEntries: Entry[]): Change[] {
    const changes: Change[] = [];

    const oldById = new Map(oldEntries.map((entry) => [entry.id, entry]));
    const newById = new Map(newEntries.map((entry) => [entry.id, entry]));

    for (const [id, newEntry] of newById) {
      const oldEntry = oldById.get(id);

      if (!oldEntry) {
        changes.push({ type: 'add', entry: newEntry });
      } else if (!entriesEqual(oldEntry, newEntry)) {
        changes.push({
          type: 'update',
          entry: newEntry,
          oldEntry: this.entries.get(id),
        });
      }
    }

    for (const [id, oldEntry] of oldById) {
      if (!newById.has(id)) {
        changes.push({
          type: 'remove',
          entry: oldEntry,
          oldEntry: this.entries.get(id),
        });
      }
    }

    return changes;
  }

  /**
   * Applies a single entry to the system.
   *
   * This is the field dispatcher from Section 5.2.1.  If the entry is new it is
   * added; otherwise the minimal disruptive action is taken for each changed
   * field.
   */
  async applyChange(entry: Entry): Promise<void> {
    const existing = this.entries.get(entry.id) as LoadedEntryRecord | undefined;

    if (!existing) {
      await this.addEntry(entry);
      return;
    }

    await this.updateEntry(existing, entry);
  }

  /**
   * Reassigns an entry's isolation realms.
   *
   * Implements Algorithm 7 from the paper:
   *
   * 1. write fresh delimiter tags for changed keys;
   * 2. move provider-owned store entries from the old realm to the new realm;
   * 3. notify dependents using the delimiter-tag `own` predicate;
   * 4. reload the entry's own fiber so its effects re-install under the new
   *    realm.
   */
  async patchIsolation(
    entry: LoadedEntry,
    newIsolation: Map<Key, Realm>,
  ): Promise<void> {
    const loaded = entry as LoadedEntryRecord;

    if (loaded.disabled || !loaded.fiber) {
      loaded.isolate = new Map(newIsolation);
      return;
    }

    const fiber = loaded.fiber;
    const ctx = fiber.ctx as RuntimeContext;
    const current = loaded.isolate;

    interface RealmDiff {
      key: Key;
      oldRealm: Realm;
      newRealm: Realm;
      entryTag: symbol;
      providerTag: symbol | undefined;
    }

    const keys = new Set<Key>([...current.keys(), ...newIsolation.keys()]);
    const diffs: RealmDiff[] = [];

    for (const key of keys) {
      const oldRealm = current.get(key) ?? key;
      const newRealm = newIsolation.get(key) ?? key;

      if (oldRealm === newRealm) {
        continue;
      }

      // Write a fresh per-key delimiter on the entry's own context.
      const entryTag = Symbol(`cordis:realm-tag:${stringifyKey(key)}:${loaded.id}`);
      setTag(ctx, key, entryTag);

      const provider = this.findProviderForRealm(ctx, key, oldRealm);

      diffs.push({
        key,
        oldRealm,
        newRealm,
        entryTag,
        providerTag: provider ? getTag(provider.ctx as RuntimeContext, key) : undefined,
      });
    }

    if (diffs.length === 0) {
      loaded.isolate = new Map(newIsolation);
      return;
    }

    // The entry's isolate map must already be a private map (created by
    // `applyScopes`), so we mutate it in place.  Descendant contexts that were
    // derived from this context share the same map object and therefore see
    // the change.
    const isolateMap = ctx._isolateMap();
    isolateMap.clear();
    for (const [key, realm] of newIsolation) {
      isolateMap.set(key, realm);
    }

    loaded.isolate = new Map(newIsolation);

    // Move bindings owned by this entry's isolate scope.
    const store = ctx._storeMap();

    for (const diff of diffs) {
      if (diff.providerTag !== undefined && diff.providerTag === diff.entryTag) {
        if (store.has(diff.oldRealm)) {
          if (store.has(diff.newRealm) && diff.oldRealm !== diff.newRealm) {
            throw new Error(
              `Loader.patchIsolation: cannot move binding for key ` +
                `'${stringifyKey(diff.key)}' from realm ` +
                `${String(diff.oldRealm)} to occupied realm ${String(diff.newRealm)}.`,
            );
          }

          store.set(diff.newRealm, store.get(diff.oldRealm));
          store.delete(diff.oldRealm);
        }
      }
    }

    // Realm-aware notification.
    const affected = this.dependentsAffectedByRealmChange(diffs);

    for (const dependent of affected) {
      Lifecycle.refresh(dependent);
    }

    // The entry's own fiber must re-install its effects under the new realm.
    if (fiber.state === 'ACTIVE') {
      await Lifecycle.unload(fiber);
    } else {
      fiber.refresh();
    }
  }

  /* ---------------------------------------------------------------- *
   * Internal implementation
   * ---------------------------------------------------------------- */

  /** Adds a brand-new entry. */
  private async addEntry(entry: Entry): Promise<void> {
    if (this.entries.has(entry.id)) {
      await this.updateEntry(
        this.entries.get(entry.id) as LoadedEntryRecord,
        entry,
      );
      return;
    }

    const loaded = new LoadedEntryRecord(this, entry);

    if (loaded.disabled) {
      // A disabled entry is recorded but has no fiber until it is enabled.
      loaded.component = null;
      loaded.isolate = new Map<Key, Realm>();
      loaded.intercept = recordToInterceptMap(entry.intercept);
      this.entries.set(entry.id, loaded);
      return;
    }

    const component = await this.resolveComponentForEntry(entry);
    const desiredIsolation = this.computeDesiredIsolation(entry, component);

    const fiber = this.createFiber(component, entry.config);
    this.applyScopes(fiber, desiredIsolation, entry.intercept);
    fiber.refresh();

    loaded.component = component;
    loaded.fiber = fiber;
    loaded.isolate = desiredIsolation;
    loaded.intercept = recordToInterceptMap(entry.intercept);
    loaded.children = entry.children;

    this.entries.set(entry.id, loaded);
  }

  /** Dispatches a field update on an existing loaded entry. */
  private async updateEntry(
    loaded: LoadedEntryRecord,
    entry: Entry,
  ): Promise<void> {
    // URL change => full rebuild.
    if (entry.url !== loaded.url) {
      loaded.url = entry.url;
      loaded.isolateAnnotation = entry.isolate;
      loaded.children = entry.children;
      loaded.intercept = recordToInterceptMap(entry.intercept);
      loaded.config = entry.config;

      if (entry.disabled) {
        loaded.disabled = true;
        if (loaded.fiber) {
          loaded.fiber.markRetired();
          await loaded.fiber.awaitQuiescence();
          loaded.fiber = null;
        }
        return;
      }

      await this.rebuildLoaded(loaded, null, entry);
      return;
    }

    // Disabled toggle.
    if (entry.disabled && !loaded.disabled) {
      loaded.disabled = true;

      if (loaded.fiber) {
        loaded.fiber.markRetired();
        await loaded.fiber.awaitQuiescence();
        loaded.fiber = null;
      }

      // Still record metadata-only changes.
      loaded.isolateAnnotation = entry.isolate;
      loaded.children = entry.children;
      loaded.config = entry.config;
      loaded.intercept = recordToInterceptMap(entry.intercept);
      return;
    }

    if (!entry.disabled && loaded.disabled) {
      loaded.disabled = false;
      await this.ensureLoaded(loaded, entry);
    }

    if (loaded.fiber && !loaded.disabled) {
      // Interception changes are applied in place, never with a reload.
      const newIntercept = recordToInterceptMap(entry.intercept);
      if (!mapsEqual(loaded.intercept, newIntercept)) {
        this.updateIntercept(loaded, entry.intercept);
      }

      // Config changes are delegated to the component (conservative rebuild).
      if (!deepEqual(loaded.config, entry.config)) {
        await loaded.applyConfig(entry.config);
      }

      // Isolation changes go through the managed-realm algorithm.
      const desiredIsolation = this.computeDesiredIsolation(
        entry,
        loaded.component,
      );

      if (!mapsEqual(loaded.isolate, desiredIsolation)) {
        await this.patchIsolation(loaded, desiredIsolation);
      }
    } else {
      // No active fiber: record metadata changes only.
      loaded.isolateAnnotation = entry.isolate;
      loaded.children = entry.children;
      loaded.config = entry.config;
      loaded.intercept = recordToInterceptMap(entry.intercept);
    }
  }

  /** Removes a loaded entry after retiring its fiber. */
  private async removeEntry(loaded: LoadedEntry): Promise<void> {
    if (loaded.fiber) {
      loaded.fiber.markRetired();
      await loaded.fiber.awaitQuiescence();
      loaded.fiber = null;
    }

    this.entries.delete(loaded.id);
  }

  /** Ensures a non-disabled entry has a live fiber. */
  private async ensureLoaded(
    loaded: LoadedEntryRecord,
    entry: Entry,
  ): Promise<void> {
    if (loaded.fiber) {
      if (loaded.fiber.state === 'FAILED') {
        // Failed fibers are terminal by design; recover by rebuilding.
        await this.rebuildLoaded(loaded, loaded.component, entry);
      } else {
        loaded.fiber.refresh();
      }
      return;
    }

    const component =
      loaded.component ?? (await this.resolveComponentForEntry(entry));
    const desiredIsolation = this.computeDesiredIsolation(entry, component);

    const fiber = this.createFiber(component, loaded.config);
    this.applyScopes(fiber, desiredIsolation, entry.intercept);
    fiber.refresh();

    loaded.component = component;
    loaded.fiber = fiber;
    loaded.isolate = desiredIsolation;
    loaded.intercept = recordToInterceptMap(entry.intercept);
    loaded.children = entry.children;
  }

  /**
   * Rebuilds a loaded entry: retires the old fiber, imports (or reuses) the
   * component, and creates a fresh fiber with the latest configuration and
   * scopes.
   */
  async rebuildLoaded(
    loaded: LoadedEntryRecord,
    component: Component | null,
    entry?: Entry,
  ): Promise<void> {
    const targetEntry = entry ?? this.loadedToEntry(loaded);
    const effectiveComponent =
      component ?? (await this.resolveComponentForEntry(targetEntry));

    if (loaded.fiber) {
      loaded.fiber.markRetired();
      await loaded.fiber.awaitQuiescence();
      loaded.fiber = null;
    }

    const desiredIsolation = this.computeDesiredIsolation(
      targetEntry,
      effectiveComponent,
    );

    const fiber = this.createFiber(effectiveComponent, targetEntry.config);
    this.applyScopes(fiber, desiredIsolation, targetEntry.intercept);
    fiber.refresh();

    loaded.url = targetEntry.url;
    loaded.config = targetEntry.config;
    loaded.disabled = !!targetEntry.disabled;
    loaded.component = effectiveComponent;
    loaded.fiber = fiber;
    loaded.isolate = desiredIsolation;
    loaded.intercept = recordToInterceptMap(targetEntry.intercept);
    loaded.isolateAnnotation = targetEntry.isolate;
    loaded.children = targetEntry.children;
  }

  /** Applies isolation and interception scopes to a freshly created fiber. */
  applyScopes(
    fiber: Fiber,
    isolation: Map<Key, Realm>,
    intercept?: Record<string, Metadata> | Map<Key, Metadata>,
  ): void {
    const ctx = fiber.ctx as RuntimeContext;

    // Always replace the isolate/intercept maps with private copies so that
    // later in-place patch operations cannot mutate ancestor contexts.
    const nextIsolate = new Map(ctx._isolateMap());
    ctx._setIsolateMap(nextIsolate);

    for (const [key, realm] of isolation) {
      nextIsolate.set(key, realm);
    }

    const interceptMap =
      intercept instanceof Map ? intercept : recordToInterceptMap(intercept);

    const nextIntercept = new Map(ctx._interceptMap());
    ctx._setInterceptMap(nextIntercept);

    for (const [key, metadata] of interceptMap) {
      nextIntercept.set(key, metadata);
    }
  }

  /** Updates interception metadata in place, without touching the lifecycle. */
  private updateIntercept(
    loaded: LoadedEntryRecord,
    intercept?: Record<string, Metadata>,
  ): void {
    const map = recordToInterceptMap(intercept);
    loaded.intercept = map;

    if (loaded.fiber) {
      const ctx = loaded.fiber.ctx as RuntimeContext;
      const current = ctx._interceptMap();
      current.clear();
      for (const [key, metadata] of map) {
        current.set(key, metadata);
      }
    }
  }

  /** Computes the desired isolation map for an entry (public for group use). */
  computeDesiredIsolation(
    entry: Entry,
    component: Component | null,
  ): Map<Key, Realm> {
    return buildIsolationMap(entry, component);
  }

  /** Tracks a fiber so loader-level notifications can reach it. */
  trackFiber(fiber: Fiber): void {
    this.trackedFibers.add(fiber);
  }

  /**
   * Imports a component module by URL.
   *
   * Registered modules take precedence, which lets tests and HMR inject
   * components without relying on the real module graph.
   */
  async importComponent(url: string): Promise<Component> {
    const registered = Loader.moduleRegistry.get(url);
    if (registered) {
      return registered;
    }

    const mod = await import(url);
    const raw = (mod as { default?: unknown; component?: unknown }).default ??
      (mod as { component?: unknown }).component ??
      mod;

    if (
      !raw ||
      typeof (raw as Component).apply !== 'function' ||
      !Array.isArray((raw as Component).inject) ||
      !Array.isArray((raw as Component).provide)
    ) {
      throw new Error(
        `Loader.importComponent: module at '${url}' does not export a valid ` +
          'Cordis component.',
      );
    }

    return raw as Component;
  }

  /** Resolves the component for an entry, honouring nested children. */
  private async resolveComponentForEntry(entry: Entry): Promise<Component> {
    if (entry.children && entry.children.length > 0) {
      return new GroupComponent(this, entry.children);
    }

    return this.importComponent(entry.url);
  }

  /** Creates a fiber and registers it with the loader's fiber tracker. */
  private createFiber(component: Component, config: any): Fiber {
    const fiber = this.context.use(component, config);
    this.trackedFibers.add(fiber);
    return fiber;
  }

  /** Finds the unique ACTIVE fiber providing `key` in `realm`. */
  private findProviderForRealm(
    ctx: RuntimeContext,
    key: Key,
    realm: Realm,
  ): Fiber | null {
    let found: Fiber | null = null;

    for (const fiber of this.trackedFibers) {
      if (fiber.state !== 'ACTIVE') {
        continue;
      }

      if (!Lifecycle.providedKeys(fiber).includes(key)) {
        continue;
      }

      const fiberCtx = fiber.ctx as RuntimeContext;
      const fiberRealm = fiberCtx._isolateMap().get(key) ?? key;

      if (fiberRealm !== realm) {
        continue;
      }

      if (found !== null && found !== fiber) {
        throw new Error(
          `Loader.findProviderForRealm: key '${stringifyKey(key)}' is provided by ` +
            `both fiber ${found.uid} and fiber ${fiber.uid} in the same realm.`,
        );
      }

      found = fiber;
    }

    return found;
  }

  /**
   * Computes the set of fibers affected by a realm reassignment.
   *
   * A fiber is affected when:
   *
   * - it declares the changed key;
   * - it currently resolves the key to either the old or the new realm;
   * - the delimiter-tag `own` predicate differs between the dependent and the
   *   provider.
   */
  private dependentsAffectedByRealmChange(
    diffs: readonly {
      key: Key;
      oldRealm: Realm;
      newRealm: Realm;
      entryTag: symbol;
      providerTag: symbol | undefined;
    }[],
  ): Fiber[] {
    const affected: Fiber[] = [];

    for (const fiber of this.trackedFibers) {
      for (const diff of diffs) {
        if (!fiber.inject.includes(diff.key)) {
          continue;
        }

        const ctx = fiber.ctx as RuntimeContext;
        const fiberRealm = ctx._isolateMap().get(diff.key) ?? diff.key;

        if (fiberRealm !== diff.oldRealm && fiberRealm !== diff.newRealm) {
          continue;
        }

        const dependentOwn = getTag(ctx, diff.key) === diff.entryTag;
        const providerOwn =
          diff.providerTag !== undefined && diff.providerTag === diff.entryTag;

        if (dependentOwn !== providerOwn) {
          affected.push(fiber);
          break;
        }
      }
    }

    return affected;
  }

  /** Reconstructs a plain `Entry` from a loaded entry for diffing. */
  private loadedToEntry(loaded: LoadedEntry): Entry {
    const record = loaded as LoadedEntryRecord;
    const intercept: Record<string, Metadata> = {};

    for (const [key, metadata] of loaded.intercept) {
      if (typeof key === 'string') {
        intercept[key] = metadata;
      }
    }

    return {
      id: loaded.id,
      url: loaded.url,
      config: loaded.config,
      disabled: loaded.disabled,
      isolate: record.isolateAnnotation,
      intercept,
      children: record.children,
    };
  }
}
