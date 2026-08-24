var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
import { EntryTree, isJsExpr } from "@cordisjs/plugin-loader";
import { Service } from "cordis";
import { extname } from "node:path";
import { access, constants, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as yaml from "js-yaml";
var JsExpr = new yaml.Type("tag:yaml.org,2002:js", {
  kind: "scalar",
  resolve: /* @__PURE__ */ __name((data) => typeof data === "string", "resolve"),
  construct: /* @__PURE__ */ __name((data) => ({ __jsExpr: data }), "construct"),
  predicate: isJsExpr,
  represent: /* @__PURE__ */ __name((data) => data["__jsExpr"], "represent")
});
var schema = yaml.JSON_SCHEMA.extend(JsExpr);
var writable = {
  ".json": "application/json",
  ".yaml": "application/yaml",
  ".yml": "application/yaml"
};
var supported = new Set(Object.keys(writable));
var Include = class extends EntryTree {
  constructor(ctx, config) {
    super(ctx);
    this.config = config;
    this.enableLogs = config.enableLogs ?? ctx.fiber.entry?.parent.tree.enableLogs ?? false;
    this.filename = fileURLToPath(new URL(this.config.path, this.ctx.baseUrl));
    const ext = extname(this.filename);
    if (!supported.has(ext)) {
      throw new Error(`extension "${ext}" not supported`);
    }
    this.type = writable[ext];
    this.readonly = !this.type;
    this.ctx.baseUrl = new URL(".", pathToFileURL(this.filename)).href;
    ctx.on("internal/update", (config2, _, next) => {
      if (config2.path !== this.config.path) return next();
      this.root.update(this.data);
    });
  }
  config;
  static {
    __name(this, "Include");
  }
  static inject = ["loader"];
  filename;
  type;
  readonly;
  content;
  data;
  writeTask;
  async checkAccess() {
    if (!this.type) return;
    try {
      await access(this.filename, constants.W_OK);
    } catch {
      this.readonly = true;
    }
  }
  async read(forced = false) {
    const content = await readFile(this.filename, "utf8");
    if (!forced && this.content === content) return false;
    this.content = content;
    if (this.type === "application/yaml") {
      this.data = yaml.load(this.content, { schema });
    } else if (this.type === "application/json") {
      this.data = JSON.parse(this.content);
    } else {
      const module = await import(
        /* @vite-ignore */
        this.filename
      );
      this.data = module.default || module;
    }
    await this.checkAccess();
    return true;
  }
  applyPatches(data) {
    const { patches } = this.config;
    if (!patches?.length) return data;
    const entryMap = /* @__PURE__ */ new Map();
    const buildMap = /* @__PURE__ */ __name((entries) => {
      for (const entry of entries) {
        if (entry.id) entryMap.set(entry.id, entry);
        if (entry.group && Array.isArray(entry.config)) {
          buildMap(entry.config);
        }
      }
    }, "buildMap");
    buildMap(data);
    for (const patch of patches) {
      const { id, insert, name, ...overrides } = patch;
      if (insert) {
        if (id) {
          const target2 = entryMap.get(id);
          if (!target2) {
            this.ctx.root.logger?.("loader").warn("patch insert: entry %C not found", id);
            continue;
          }
          if (!target2.group) {
            this.ctx.root.logger?.("loader").warn("patch insert: entry %C is not a group", id);
            continue;
          }
          if (!Array.isArray(target2.config)) target2.config = [];
          target2.config.push(...insert);
        } else {
          data.push(...insert);
        }
        continue;
      }
      if (!id) {
        this.ctx.root.logger?.("loader").warn("patch: id is required for non-insert patches");
        continue;
      }
      const target = entryMap.get(id);
      if (!target) {
        this.ctx.root.logger?.("loader").warn("patch: entry %C not found", id);
        continue;
      }
      if (name && name !== target.name) {
        this.ctx.root.logger?.("loader").warn(
          "patch: name mismatch for %C (expected %C, got %C), skipping",
          id,
          target.name,
          name
        );
        continue;
      }
      for (const [key, value] of Object.entries(overrides)) {
        if (key === "id") continue;
        target[key] = value;
      }
    }
    return data;
  }
  async *[Service.init]() {
    try {
      await this.read();
    } catch {
      if (this.config.initial) {
        this.writeFile(this.config.initial);
        await this.read();
      } else {
        throw new Error(`config file not found: ${this.filename}`);
      }
    }
    yield () => this.stop();
    const data = this.applyPatches([...this.data]);
    await this.root.update(data);
  }
  stop() {
    this.root.stop();
  }
  async refresh() {
    if (!await this.read()) return;
    this.root.update(this.data);
  }
  async _writeFile(config) {
    if (this.readonly) {
      throw new Error(`cannot overwrite readonly config`);
    }
    if (this.type === "application/yaml") {
      this.content = yaml.dump(config, { schema });
    } else if (this.type === "application/json") {
      this.content = JSON.stringify(config, null, 2);
    }
    await writeFile(this.filename + ".tmp", this.content);
    await rename(this.filename + ".tmp", this.filename);
  }
  writeFile(config) {
    clearTimeout(this.writeTask);
    this.writeTask = setTimeout(() => {
      this.writeTask = void 0;
      this._writeFile(config);
    }, 0);
  }
  write() {
    this.context.emit("loader/config-update");
    return this.writeFile(this.root.data);
  }
};
var index_default = Include;
export {
  Include,
  index_default as default
};
