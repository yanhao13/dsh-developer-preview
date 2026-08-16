/**
 * Section 5.2.2: the hot module replacement engine (Algorithms 8-10). HMR
 * applies the revertible-effect pattern at the module level: a fiber bounds
 * all of its component's effects and coeffects, so replacing a component is
 * fiber operations alone — disposing the old fiber recovers everything it
 * installed, and a fresh fiber reinstalls it. No developer-annotated
 * acceptance boundaries are needed.
 */

/** A module graph: each url knows its direct imports and how to load itself. */
export interface ModuleSystem {
  getImports(url: string): readonly string[]
  /** Load the module's component, honoring the cache. */
  load(url: string): unknown
  /** Invalidate the accepted modules' caches, returning the backup for rollback. */
  invalidate(accepted: ReadonlySet<string>): ReadonlyMap<string, unknown>
  /** Restore the caches from a backup (Algorithm 10 line 8). */
  restore(backup: ReadonlyMap<string, unknown>): void
}

/**
 * Algorithm 8: module classification. A module is accepted once one of its
 * imports is accepted, and declined once all of its imports are declined;
 * anything left undecided (an import cycle) defaults to declined.
 */
export const classify = (
  system: ModuleSystem,
  stashed: ReadonlySet<string>,
  externals: ReadonlySet<string>,
): { accepted: Set<string>; declined: Set<string> } => {
  const accepted = new Set(stashed)
  const declined = new Set(externals)
  const pending = new Set<string>()
  for (const url of stashed) {
    for (const dep of system.getImports(url)) {
      if (!accepted.has(dep) && !declined.has(dep)) pending.add(dep)
    }
  }
  let progress = true
  while (progress) {
    progress = false
    for (const url of [...pending]) {
      const imports = system.getImports(url)
      if (imports.some((dep) => accepted.has(dep))) {
        accepted.add(url)
        pending.delete(url)
        progress = true
      } else if (imports.every((dep) => declined.has(dep))) {
        declined.add(url)
        pending.delete(url)
        progress = true
      } else {
        for (const dep of imports) {
          if (!accepted.has(dep) && !declined.has(dep)) pending.add(dep)
        }
      }
    }
  }
  for (const url of pending) declined.add(url)
  return { accepted, declined }
}

/**
 * Algorithm 9 (part 1): the transitive dependency tree of a module, with the
 * declined set as a boundary.
 */
export const getDependencies = (system: ModuleSystem, root: string, declined: ReadonlySet<string>): Set<string> => {
  const deps = new Set<string>()
  const traverse = (url: string): void => {
    if (deps.has(url) || declined.has(url)) return
    deps.add(url)
    for (const child of system.getImports(url)) traverse(child)
  }
  traverse(root)
  return deps
}

/**
 * Algorithm 9 (part 2): an entry is stale exactly when its dependency tree
 * intersects the accepted set; that tree is then folded into accepted.
 */
export const detect = (
  system: ModuleSystem,
  entries: readonly { url: string }[],
  accepted: Set<string>,
  declined: ReadonlySet<string>,
): { url: string }[] => {
  const stale: { url: string }[] = []
  for (const entry of entries) {
    const tree = getDependencies(system, entry.url, declined)
    if ([...tree].some((dep) => accepted.has(dep))) {
      for (const dep of tree) accepted.add(dep)
      stale.push(entry)
    }
  }
  return stale
}

/** One stale entry the engine reloads transactionally (Algorithm 10). */
export interface StaleEntry {
  readonly url: string
  readonly config?: unknown
}

/** A mutable slot the engine swaps: the entry plus its current fiber. */
export interface StaleSlot {
  entry: StaleEntry
  fiber: unknown
}

/**
 * An in-memory module system for tests and demos: a factory per url, a static
 * import graph, and a cache whose invalidation backs up the removed modules
 * for rollback (Algorithm 10).
 */
export const createModuleSystem = (
  factory: (url: string) => unknown,
  imports: Readonly<Record<string, readonly string[]>>,
): ModuleSystem => {
  const cache = new Map<string, unknown>()
  return {
    getImports: (url) => imports[url] ?? [],
    load: (url) => {
      let module = cache.get(url)
      if (module === undefined) {
        module = factory(url)
        cache.set(url, module)
      }
      return module
    },
    invalidate: (accepted) => {
      const backup = new Map<string, unknown>()
      for (const url of accepted) {
        const module = cache.get(url)
        if (module !== undefined) {
          backup.set(url, module)
          cache.delete(url)
        }
      }
      return backup
    },
    restore: (backup) => {
      for (const [url, module] of backup) cache.set(url, module)
    },
  }
}

/**
 * Algorithm 10: transactional module reload. Backs up the caches, disposes and
 * re-instantiates each stale entry; on any failure the caches are restored and
 * every stale entry is rebuilt from the backup before rethrowing — the system
 * never enters a half-reloaded state.
 */
export const transactionalReload = async (
  system: ModuleSystem,
  accepted: ReadonlySet<string>,
  stale: readonly StaleSlot[],
  retire: (fiber: unknown) => Promise<void>,
  instantiate: (entry: StaleEntry) => unknown,
): Promise<void> => {
  const backup = system.invalidate(accepted)
  try {
    for (const slot of stale) {
      await retire(slot.fiber)
      slot.fiber = instantiate(slot.entry)
    }
  } catch (error) {
    system.restore(backup)
    for (const slot of stale) {
      await retire(slot.fiber)
      slot.fiber = instantiate(slot.entry)
    }
    throw error
  }
}
