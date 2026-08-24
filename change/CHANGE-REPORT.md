# Change Files — beachball classification for master@{3day}...master

**Window:** 141eb6fe (2026-08-19T23:11+08:00) → b150a551 (2026-08-21T20:03+08:00) · 207 commits · 2,416 changed files

**Skill applied:** fluentui `change` (create a beachball change file per package: type + user-facing message).
Adaptations: deepseek-harness has no beachball install (`yarn change` → N/A); the repo-native gate is
`scripts/change-scope.ts` — its `ChangeScopeReport` output is `change-scope.json` in this folder. Change files
follow the beachball JSON schema `{type, comment, packageName, email, dependentChangeType}`.
Verification step (`yarn check:change`) maps to: every changed workspace package has exactly one change file (see table).

## Type rules applied

- `none` — every changed path is tests/docs/markdown/i18n only (no published-package impact)
- `minor` — new package, added source artifact (`src/`, manifests, cordis configs), or a `feat(...)` commit scoped to the package
- `patch` — everything else (bug fixes, refactors); `major` never assigned without approval

## Summary

| Type | Packages |
|------|----------|
| minor | 34 |
| patch | 196 |

## Per-package classification (230 workspace packages)

| Package | Type | A/M/D/R | Sample evidence |
|---------|------|---------|-----------------|
| `@deepseek-ai/dsh` | minor | 7M | expand source upload envelope |
| `@deepseek-ai/dsh-web-frontend` | minor | 5A/44M | expand source upload envelope |
| `@deepseek-ai/dsh-acp` | patch | 3M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-api-gateway` | patch | 5M | pin the namespace atomic-visibility guarantee |
| `@deepseek-ai/dsh-api-remotes` | patch | 2M | record that a pending question dies with the host |
| `@deepseek-ai/dsh-attachment-local` | minor | 8A/10M | store a deterministic canonical image encoding |
| `@deepseek-ai/dsh-attachment` | minor | 9M | store a deterministic canonical image encoding |
| `@deepseek-ai/dsh-app-boot` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-cmdline` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-base` | patch | 3M | fix rebased image note links |
| `@deepseek-ai/dsh-headless` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-web-app` | minor | 4M | refine subagent header switcher |
| `@deepseek-ai/dsh-client-connection` | patch | 9M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-hmr` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-locale` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-modules` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-runtime` | patch | 6M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-agent-preset` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-attachment` | patch | 1M | accept opaque WebP alpha omission |
| `@deepseek-ai/dsh-client-ui-brand-official` | patch | 1M | catch the branch up with the static and smoke gates |
| `@deepseek-ai/dsh-client-ui-commands` | patch | 4M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-conversation` | patch | 19M | render the terminal turn error after same-turn retries exhaust |
| `@deepseek-ai/dsh-client-ui-deliverables` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-directory-picker-browse` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-directory-picker-native` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-goal` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-input-trigger` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-jobs` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-layout` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-message-feedback` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-model-selection` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-permission-presets` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-plan` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-primitives` | patch | 2A/14M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-reference` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-renderer` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-settings-general` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-settings-models` | patch | 6M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-settings-plugin-inventory` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-settings-plugins` | patch | 6M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-settings` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-sidebar` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-skill` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-slots` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-subagent` | patch | 8M/2R | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-theme` | patch | 7M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-tool` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-trajectory` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-user-questions` | patch | 7M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-workflow-run` | patch | 3M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-client-ui-workspace` | patch | 5M | promote new sessions only once |
| `@deepseek-ai/dsh-client-web` | minor | 5M | refine subagent header switcher |
| `@deepseek-ai/dsh-code-runtime-python` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-code-runtime-worker-thread` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-code-runtime` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-command-compact` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-compaction-basic` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-compaction-tool-result-pruner` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-compaction` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-agent-instructions` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-file-reference-local` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-file-reference` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-session-reference` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-time-context` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tmux-context` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-agent-default-model` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-agent-loop` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-agent-tool-presentation` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-agent` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-scope` | patch | 3M | scope switcher and merge validation |
| `@deepseek-ai/dsh-session` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-system-prompt` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tools` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-authorization` | minor | 11A | new package; upgrade the pre-release flat document at boot |
| `@deepseek-ai/dsh-credentials-local` | minor | 2A/10M | upgrade the pre-release flat document at boot |
| `@deepseek-ai/dsh-credentials` | minor | 10M | upgrade the pre-release flat document at boot |
| `@deepseek-ai/dsh-e2b` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-fs-e2b` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-subprocess-e2b` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-acp-demo` | patch | 4M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-agent-spine-demo` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-sdk-jsonrpc-demo` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-experimental-agent-team` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-experimental-tool-agent-team` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-cordis-client-runner` | patch | 2M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-cordis-host-runner` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-tool-cordis` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-client-ui-cordis` | patch | 1M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-command-feedback` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-message-feedback` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-fs-local` | minor | 3M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-fs-observation-policy` | minor | 3M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-fs-sandbox` | minor | 3M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-fs` | minor | 3M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-tool-fs-search` | minor | 3M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-tool-fs` | minor | 6M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-tool-str-replace-editor` | minor | 3M | read_image reports downscaled dimensions and coordinate scale |
| `@deepseek-ai/dsh-command-goal` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-goal-round-driver` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-goal` | patch | 5M | update package contents |
| `@deepseek-ai/dsh-tool-goal` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-repeat-tool-reminder` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-tool-call-timeout-policy` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-hook-protocol` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-hooks-claude-code` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-hooks-codex` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-host-apiproxy` | patch | 9M | record that a pending question dies with the host |
| `@deepseek-ai/dsh-host-directory-picker-auto` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-host-directory-picker-browse` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-host-directory-picker-native` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-host-directory-picker` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-host-frontend-static` | patch | 6M | return 404 for a missing index |
| `@deepseek-ai/dsh-host-plugin-inventory` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-host-webserver` | minor | 1A/6M | refine subagent header switcher |
| `@deepseek-ai/dsh-anonymous-user-id` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-commands` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-permission-presets` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-tool-ask-user` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-user-approval` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-user-questions` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-jobs-local` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-jobs` | patch | 3M | stop PR gray checks from lifecycle and release publish jobs |
| `@deepseek-ai/dsh-tool-jobs` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-llm-deepseek` | minor | 7A/15M | sign in to a provider instead of withholding it |
| `@deepseek-ai/dsh-llm-pi-ai` | minor | 5A/19M | sign in to a provider instead of withholding it |
| `@deepseek-ai/dsh-llm-retry` | minor | 1M | sign in to a provider instead of withholding it |
| `@deepseek-ai/dsh-llm` | minor | 8M | sign in to a provider instead of withholding it |
| `@deepseek-ai/dsh-token-meter` | minor | 8M | sign in to a provider instead of withholding it |
| `@deepseek-ai/dsh-lsp-stdio` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-lsp` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-lsp` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-mcp-client` | patch | 2M | align turn-error prose with exhausted-retry rendering |
| `@deepseek-ai/dsh-plan-mode` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-agent-presets` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-persona` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-invariants` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-sandbox-local` | patch | 8M | isolate bwrap PID namespace |
| `@deepseek-ai/dsh-sandbox-policy` | patch | 3M | isolate bwrap PID namespace |
| `@deepseek-ai/dsh-sandbox-windows-acl` | patch | 3M | isolate bwrap PID namespace |
| `@deepseek-ai/dsh-sandbox` | patch | 3M | isolate bwrap PID namespace |
| `@deepseek-ai/dsh-schedule` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-sdk-client` | minor | 3M | structured index injection table and the client boot seams |
| `@deepseek-ai/dsh-sdk-protocol` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-sdk-jsonrpc-server` | minor | 3M | structured index injection table and the client boot seams |
| `@deepseek-ai/dsh-session-log-export` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-session-query-sqlite` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-session-query` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-session-query` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-session-checkpoint-policy` | patch | 1M | keep host state off wire |
| `@deepseek-ai/dsh-session-persistence-jsonl` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-persistence-sqlite` | patch | 1M | keep host state off wire |
| `@deepseek-ai/dsh-session-persistence` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-projection-cache` | patch | 6M | keep host state off wire |
| `@deepseek-ai/dsh-session-projection` | patch | 7M | keep host state off wire |
| `@deepseek-ai/dsh-session-stats` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-telemetry-otel` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-telemetry` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-title-all-prompts-llm` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-title-first-prompt-llm` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-title-llm` | patch | 3M | keep host state off wire |
| `@deepseek-ai/dsh-session-title` | patch | 5M | keep host state off wire |
| `@deepseek-ai/dsh-settings-file` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-settings` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-bash-local` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-bash-sandbox` | patch | 4M | isolate bwrap PID namespace |
| `@deepseek-ai/dsh-pwsh-local` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-pwsh-sandbox` | patch | 3M | isolate bwrap PID namespace |
| `@deepseek-ai/dsh-shell-env` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-shell` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-bash-persistent` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-bash` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-pwsh` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-skill-badge` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-skill-filesystem` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-skill` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-tool-skill` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-spill-local` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-spill-policy` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-spill` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-storage-domain` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-storage-json` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-storage-sqlite` | patch | 4M | update package contents |
| `@deepseek-ai/dsh-storage` | patch | 3M | normalize image storage API |
| `@deepseek-ai/dsh-subagent-acp` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subagent-claude-code` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subagent-codex` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subagent-dsh-sdk` | patch | 3M | 0.1.1-rc.2 |
| `@deepseek-ai/dsh-subagent-fork-in-process` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subagent-in-process-driver` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subagent-spawn-in-process` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subagent` | minor | 7M | refine subagent header switcher |
| `@deepseek-ai/dsh-tool-subagent-control` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-tool-subagent-report` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-tool-subagent` | patch | 3M | rethrow accumulated cleanup errors; register fresh handle |
| `@deepseek-ai/dsh-subprocess-local` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-subprocess` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-terminal-bash` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-terminal` | patch | 1M | render the terminal turn error after same-turn retries exhaust |
| `@deepseek-ai/dsh-tool-terminal` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-acp-snapshot` | patch | 20M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-agent-loop-testkit` | patch | 1M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-client-test-runtime` | patch | 2M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-llm-mock-server` | patch | 1M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-llm-replay` | patch | 6M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-loader-smoke` | patch | 1M | use unique temp dirs for acp-demo composition persistence |
| `@deepseek-ai/dsh-tool-todo` | patch | 5M | update package contents |
| `@deepseek-ai/dsh-typert-generator` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-typert-loader` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-typert-protocol` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-typert-registry` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-atomic-write` | minor | 6M | state the writer-lock wait limit per call |
| `@deepseek-ai/dsh-brand` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-home-paths` | patch | 1M | update package contents |
| `@deepseek-ai/dsh-launch-environment` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-native-command` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-output-retention` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-timeout` | patch | 3M | decouple files and stream timeouts |
| `@deepseek-ai/dsh-tool-web` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-web-fetch-http` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-web-search-deepseek` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-web-search-exa` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-web-search-perplexity` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-web` | minor | 3M | refine subagent header switcher |
| `@deepseek-ai/dsh-tool-ralph` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-tool-workflow` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-workflow-worker-thread` | patch | 3M | update package contents |
| `@deepseek-ai/dsh-workflow` | patch | 3M | narrow workflow.on before Object.keys in event-set assertion |
| `@deepseek-ai/dsh-workspace` | patch | 3M | promote new sessions only once |
| `@deepseek-ai/website` | minor | 3M | expand source upload envelope |

## Non-workspace areas (no npm package, no change file)

| Area | Files | Note |
|------|-------|------|
| `.agents` | 888M/54A/3R/6D | agent workflows & Agent Notes |
| `.github` | 7M/3A | CI workflows |
| `root` | 8M | root config (package.json, pnpm-lock, tsconfigs) — covered by `@deepseek-ai/dsh` change file via apps/cli |
| `docs` | 258M | documentation (published via website) |
| `examples` | 153M | runnable cordis.yml example leaves |
| `native` | 2M | native READMEs |
| `packages` | 96M | group-level README/AGENTS docs |
| `python` | 5M | Python SDK |
| `scripts` | 40M/4A | repo gates/generators |
