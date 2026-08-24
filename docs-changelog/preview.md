# Preview release: v0.1.1-rc.2

Released: August 21, 2026

## Highlights

**Normalized image pipeline:** attachment now handles images through a normalized pipeline with a dedicated Files API, tolerant of opaque WebP alpha variants.

**DeepSeek vision model published:** the vision model joins the llm-deepseek model catalog and can be served to the loop.

**OAuth-ready credentials:** the credentials capability gained an abstracted service with OAuth login support alongside the existing env/.env provider.

**Web UI refinements:** wide markdown tables get an overflow view sized by column count, ask_user_question answers can span multiple lines, and nested subagent headers navigate by area.

**Sandbox and build hardening:** bubblewrap procfs root escapes are blocked, standalone pnpm entrypoints build, and the doc-sync critical path is shorter.

## What's Changed

- Trim knip.json to 655 lines by removing 15 stale or glob-duplicate workspace entries. Behavior-neutral under knip's specificity-based workspace config selection; CI green, issue policy green, review threads resolved. [#2758](https://github.com/deepseek-ai/deepseek-harness/pull/2758)

- refactor(projection): separate host state from client views [#2730](https://github.com/deepseek-ai/deepseek-harness/pull/2730)

- feat(web): wrap markdown tables to the column with an overflow wide view [#2776](https://github.com/deepseek-ai/deepseek-harness/pull/2776)

- feat(webserver): structured index injection table and the client boot seams [#2725](https://github.com/deepseek-ai/deepseek-harness/pull/2725)

- feat(web): answer ask_user_question over multiple lines [#2820](https://github.com/deepseek-ai/deepseek-harness/pull/2820)

- feat(web): preserve near-full cache-hit precision [#2749](https://github.com/deepseek-ai/deepseek-harness/pull/2749)

- feat(credentials): abstract credentials service and support OAuth login [#2509](https://github.com/deepseek-ai/deepseek-harness/pull/2509)

- feat(web): refine nested subagent header navigation [#2856](https://github.com/deepseek-ai/deepseek-harness/pull/2856)

- feat(llm-deepseek): publish the vision model [#2726](https://github.com/deepseek-ai/deepseek-harness/pull/2726)

- perf(infra): shorten doc-sync critical path [#2739](https://github.com/deepseek-ai/deepseek-harness/pull/2739)

- feat(attachment): add normalized image and Files API pipeline [#2676](https://github.com/deepseek-ai/deepseek-harness/pull/2676)

- fix(web): improve permission labels and blank defaults [#2608](https://github.com/deepseek-ai/deepseek-harness/pull/2608)

- fix(web): key composer reference decorations by draft order [#2796](https://github.com/deepseek-ai/deepseek-harness/pull/2796)

- fix(sandbox): prevent bwrap procfs root escapes [#1798](https://github.com/deepseek-ai/deepseek-harness/pull/1798)

- fix(ui-workspace): pin the current blank New Session row first [#2794](https://github.com/deepseek-ai/deepseek-harness/pull/2794)

- fix(frontend-static): return 404 for missing paths [#2808](https://github.com/deepseek-ai/deepseek-harness/pull/2808)

- fix(web): render the terminal turn error after same-turn retries exhaust [#2844](https://github.com/deepseek-ai/deepseek-harness/pull/2844)

- fix(web): carry the composer edit range from the pre-edit selection [#2814](https://github.com/deepseek-ai/deepseek-harness/pull/2814)

- fix(build): support standalone pnpm entrypoints [#2878](https://github.com/deepseek-ai/deepseek-harness/pull/2878)

- revert: undo #2608 permission labels and blank defaults [#2903](https://github.com/deepseek-ai/deepseek-harness/pull/2903)

**Full Changelog:** https://github.com/deepseek-ai/deepseek-harness/compare/master@{3day}...master
