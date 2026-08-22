export interface YarnRc {
    yarnPath?: string;
    [key: string]: any;
}
export interface StageYarnAgent {
    name: string;
    version?: string;
}
export interface StageYarnOptions {
    rootDir: string;
    registry: string;
    agent: StageYarnAgent | undefined;
    cacheDir?: string;
    tempDir?: string;
    fetcher?: typeof fetch;
}
/**
 * Set up a yarn binary in `rootDir` per the following spec. Returns the version
 * staged (or already present), or `undefined` if nothing was done.
 *
 * 1. `package.json` has `packageManager` → no-op (the template opted into a
 *    specific toolchain; respect it).
 * 2. Caller isn't yarn (or is unknown) → no-op.
 * 3. Caller is yarn AND `.yarnrc.yml` pins a recognizable `yarnPath`
 *    (`.yarn/releases/yarn-<v>.cjs`):
 *      - Pinned binary already on disk → no-op.
 *      - Binary missing → fetch exactly that version and stage it.
 * 4. Caller is yarn 1.x AND no yarnPath is declared → fetch
 *    `@yarnpkg/cli-dist` at dist-tag `latest`, inject yarnPath into the rc,
 *    stage the binary. This is the path that lets a global yarn 1 delegate
 *    to a modern yarn on a template that didn't declare one.
 * 5. Any other yarn case (2+/3+/4+ without yarnPath, or yarnPath with a
 *    non-standard path) → no-op.
 */
export declare function stageYarnBin(options: StageYarnOptions): Promise<string | undefined>;
export default function scaffold(options?: Record<string, any>): Promise<void>;
