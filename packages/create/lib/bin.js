#!/usr/bin/env node

// src/bin.ts
import pkg from "../package.json" with { type: "json" };
import scaffold from "./index.js";
scaffold({
  name: "cordis",
  version: pkg.version,
  template: "@cordisjs/boilerplate"
});
