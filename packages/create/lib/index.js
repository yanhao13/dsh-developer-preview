var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { access, copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { basename, join, relative } from "node:path";
import { Readable } from "node:stream";
import * as tar from "tar";
import * as yaml from "js-yaml";
import envPaths from "env-paths";
import getRegistry from "get-registry";
import parse from "yargs-parser";
import prompts from "prompts";
import which from "which-pm-runs";
import kleur from "kleur";
var paths = envPaths("create-cordis", { suffix: "" });
var project;
var rootDir;
var cwd = process.cwd();
var argv = parse(process.argv.slice(2), {
  alias: {
    ref: ["r"],
    forced: ["f"],
    git: ["g"],
    mirror: ["m"],
    prod: ["p"],
    template: ["t"],
    yes: ["y"]
  }
});
function supports(command) {
  try {
    execSync(command, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
__name(supports, "supports");
async function confirm(message) {
  const { yes } = await prompts({
    type: "confirm",
    name: "yes",
    initial: "Y",
    message
  });
  return yes;
}
__name(confirm, "confirm");
async function stageYarnBin(options) {
  const { rootDir: dir, registry, agent, fetcher = fetch } = options;
  const cacheDir = options.cacheDir ?? join(paths.cache, ".yarn/releases");
  const tempDir = options.tempDir ?? join(paths.temp, "@yarnpkg/cli-dist");
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  } catch {
    return void 0;
  }
  if (pkg.packageManager) return void 0;
  if (agent?.name !== "yarn") return void 0;
  const rcPath = join(dir, ".yarnrc.yml");
  let rc = {};
  try {
    const loaded = yaml.load(await readFile(rcPath, "utf8"));
    if (loaded && typeof loaded === "object") rc = loaded;
  } catch {
  }
  const pinned = rc.yarnPath?.match(/^\.yarn\/releases\/yarn-([^/]+)\.cjs$/)?.[1];
  let version;
  let writeRc = false;
  if (rc.yarnPath) {
    if (!pinned) return void 0;
    const targetFile = join(dir, rc.yarnPath);
    try {
      await access(targetFile);
      return pinned;
    } catch {
      version = pinned;
    }
  } else {
    if (!agent.version?.startsWith("1.")) return void 0;
    const resp = await fetcher(`${registry}/@yarnpkg/cli-dist`);
    if (!resp.ok) return void 0;
    const meta = await resp.json();
    version = meta?.["dist-tags"]?.latest;
    if (!version) return void 0;
    rc.yarnPath = `.yarn/releases/yarn-${version}.cjs`;
    writeRc = true;
  }
  const cacheFile = join(cacheDir, `yarn-${version}.cjs`);
  try {
    await access(cacheFile);
  } catch {
    await mkdir(tempDir, { recursive: true });
    await mkdir(cacheDir, { recursive: true });
    const resp = await fetcher(`${registry}/@yarnpkg/cli-dist/-/cli-dist-${version}.tgz`);
    await new Promise((resolve, reject) => {
      const stream = Readable.fromWeb(resp.body).pipe(tar.extract({
        cwd: tempDir,
        newer: true,
        strip: 2
      }, ["package/bin/yarn.js"]));
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
    await copyFile(join(tempDir, "yarn.js"), cacheFile);
    await rm(tempDir, { recursive: true });
  }
  const targetDir = join(dir, ".yarn/releases");
  await mkdir(targetDir, { recursive: true });
  await copyFile(cacheFile, join(targetDir, `yarn-${version}.cjs`));
  if (writeRc) {
    await writeFile(rcPath, yaml.dump(rc));
  }
  return version;
}
__name(stageYarnBin, "stageYarnBin");
var Scaffold = class {
  constructor(options = {}) {
    this.options = options;
  }
  options;
  static {
    __name(this, "Scaffold");
  }
  registry;
  async getName() {
    if (argv._[0]) return "" + argv._[0];
    const { name } = await prompts({
      type: "text",
      name: "name",
      message: "Project name:",
      initial: `${this.options.name}-app`
    });
    return name.trim();
  }
  async prepare() {
    const stats = await stat(rootDir).catch(() => null);
    if (!stats) return mkdir(rootDir, { recursive: true });
    let message;
    if (stats.isDirectory()) {
      const files = await readdir(rootDir);
      if (!files.length) return;
      message = `  Target directory "${project}" is not empty.`;
    } else {
      message = `  Target "${project}" is not a directory.`;
    }
    if (!argv.forced && !argv.yes) {
      console.log(kleur.yellow(message));
      const yes = await confirm("Remove existing files and continue?");
      if (!yes) process.exit(0);
    }
    await rm(rootDir, { recursive: true });
    await mkdir(rootDir);
  }
  async scaffold() {
    const registry = await getRegistry();
    if (!registry) {
      console.log(kleur.red("error") + " unable to detect npm registry");
      process.exit(1);
    }
    this.registry = registry.replace(/\/$/, "");
    console.log(kleur.dim("  Registry server: ") + this.registry);
    console.log(kleur.dim("  Scaffolding project in ") + project + kleur.dim(" ..."));
    const template = argv.template || this.options.template;
    const resp1 = await fetch(`${this.registry}/${template}`);
    if (!resp1.ok) {
      const { status, statusText } = resp1;
      console.log(`${kleur.red("error")} request failed with status code ${status} ${statusText}`);
      process.exit(1);
    }
    const remote = await resp1.json();
    const version = remote["dist-tags"][argv.ref || "latest"];
    const resp2 = await fetch(remote.versions[version].dist.tarball);
    await new Promise((resolve, reject) => {
      const stream = Readable.fromWeb(resp2.body).pipe(tar.extract({
        cwd: rootDir,
        newer: true,
        strip: 1
      }));
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
    await stageYarnBin({ rootDir, registry: this.registry, agent: which() });
    await this.writePackageJson();
    console.log(kleur.green("  Done.\n"));
  }
  async writePackageJson() {
    const filename = join(rootDir, "package.json");
    const meta = JSON.parse(await readFile(filename, "utf8"));
    meta.name = project;
    if (argv.prod) {
      delete meta.workspaces;
      delete meta.devDependencies;
    }
    await writeFile(filename, JSON.stringify(meta, null, 2) + "\n");
  }
  async initGit() {
    if (!argv.git || !supports("git --version")) return;
    execSync("git init", { stdio: "ignore", cwd: rootDir });
    console.log(kleur.green("  Done.\n"));
  }
  async install() {
    if (argv.yes) return;
    const agent = which()?.name || "npm";
    const yes = await confirm("Install and start it now?");
    if (yes) {
      execSync([agent, "install"].join(" "), { stdio: "inherit", cwd: rootDir });
      execSync([agent, "run", "start"].join(" "), { stdio: "inherit", cwd: rootDir });
    } else {
      console.log(kleur.dim("  You can start it later by:\n"));
      if (rootDir !== cwd) {
        const related = relative(cwd, rootDir);
        console.log(kleur.blue(`  cd ${kleur.bold(related)}`));
      }
      console.log(kleur.blue(`  ${agent === "yarn" ? "yarn" : `${agent} install`}`));
      console.log(kleur.blue(`  ${agent === "yarn" ? "yarn start" : `${agent} run start`}`));
      console.log();
    }
  }
  async start() {
    console.log();
    console.log(`  ${kleur.bold(`create ${this.options.name}`)}  ${kleur.blue(`v${this.options.version}`)}`);
    console.log();
    const name = await this.getName();
    rootDir = join(cwd, name);
    project = basename(rootDir);
    await this.prepare();
    await this.scaffold();
    await this.initGit();
    await this.install();
  }
};
function scaffold(options = {}) {
  return new Scaffold(options).start();
}
__name(scaffold, "scaffold");
export {
  scaffold as default,
  stageYarnBin
};
