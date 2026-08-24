# Wiki Changelog — deepseek-harness (last 3 days)

**Source repository:** `https://github.com/deepseek-ai/deepseek-harness` (resolved from `git remote get-url origin`)

**Window:** `master@{3day}` = 141eb6fe → `master` = b150a551 · 207 commits · grouped daily (within last 7 days).

## 2026-08-10

**1 commits.** 0 feature changes, 0 fixes.

### 📝 Documentation
- docs: remove line numbers from subsystem catalog links ([f248dc3](https://github.com/deepseek-ai/deepseek-harness/commit/f248dc377))

## 2026-08-18

**9 commits.** 0 feature changes, 5 fixes.

### 🐛 Bug Fixes
- fix(web): improve permission labels and blank defaults ([b03b1f2](https://github.com/deepseek-ai/deepseek-harness/commit/b03b1f2e7))
- fix(i18n): preserve authored external URLs ([27b5c12](https://github.com/deepseek-ai/deepseek-harness/commit/27b5c12da))
- fix(i18n): close automated review findings ([ad65169](https://github.com/deepseek-ai/deepseek-harness/commit/ad6516933))
- fix(i18n): scope switcher and merge validation ([df11a8a](https://github.com/deepseek-ai/deepseek-harness/commit/df11a8af9))
- fix(i18n): share Markdown link parsing ([08ec262](https://github.com/deepseek-ai/deepseek-harness/commit/08ec2622b))

### 🔄 Refactoring
- refactor(i18n): remove obsolete link lookup ([f6fb074](https://github.com/deepseek-ai/deepseek-harness/commit/f6fb07403))
- refactor(i18n): narrow link normalization ([1c253f7](https://github.com/deepseek-ai/deepseek-harness/commit/1c253f7c5))
- test: omit persistence envelopes from session snapshots ([b6e61f6](https://github.com/deepseek-ai/deepseek-harness/commit/b6e61f61a))

### 📝 Documentation
- docs(i18n): localize Chinese internal links ([8d36746](https://github.com/deepseek-ai/deepseek-harness/commit/8d3674695))

## 2026-08-19

**38 commits.** 3 feature changes, 17 fixes.

### 🆕 New Features
- feat(web): size markdown tables by column count, widen wide ones past the column ([000ab97](https://github.com/deepseek-ai/deepseek-harness/commit/000ab970f))
- feat(web): preserve near-full cache-hit precision ([a4da0f4](https://github.com/deepseek-ai/deepseek-harness/commit/a4da0f40d))
- feat(llm-deepseek): publish the vision model ([4fa38d6](https://github.com/deepseek-ai/deepseek-harness/commit/4fa38d6a2))

### 🐛 Bug Fixes
- fix(web): address permission preset review feedback ([35778ec](https://github.com/deepseek-ai/deepseek-harness/commit/35778ec2f))
- fix(cic): narrow workflow.on before Object.keys in event-set assertion ([7ae647d](https://github.com/deepseek-ai/deepseek-harness/commit/7ae647d52))
- fix(cic): sync event-set assertion, zh twins, and master-workflow attribution ([6d6e4e1](https://github.com/deepseek-ai/deepseek-harness/commit/6d6e4e17c))
- fix(cic): restore serial-linux drill comment, sync pnpm-isolation note, polish runbook ([7247de9](https://github.com/deepseek-ai/deepseek-harness/commit/7247de9d3))
- fix(cic): correct pnpm-caching note and extend setup-dest test to ci-master ([82f9040](https://github.com/deepseek-ai/deepseek-harness/commit/82f9040a7))
- fix(cic): address CI-split review - restore PR concurrency, fix comment migration, restore deleted spec block ([1d5e419](https://github.com/deepseek-ai/deepseek-harness/commit/1d5e4199c))
- fix(ci): reuse pinned bubblewrap setup in e2e ([f938d8e](https://github.com/deepseek-ai/deepseek-harness/commit/f938d8e1c))
- review fix: avoid bigint cache-hit formatting ([fa2ce12](https://github.com/deepseek-ai/deepseek-harness/commit/fa2ce1216))
- fix(test): retain session fixture line diagnostics ([e1a71c0](https://github.com/deepseek-ai/deepseek-harness/commit/e1a71c08b))
- fix(session-projection): keep host state off wire ([9127d7e](https://github.com/deepseek-ai/deepseek-harness/commit/9127d7e8b))
- fix doc-site fence cache safety ([f281933](https://github.com/deepseek-ai/deepseek-harness/commit/f281933dd))
- fix(snapshot): align malformed-row labels and restore projection coverage ([d1b16e5](https://github.com/deepseek-ai/deepseek-harness/commit/d1b16e57d))
- fix(i18n): encode exact link paths safely ([ae9b692](https://github.com/deepseek-ai/deepseek-harness/commit/ae9b69287))
- fix(i18n): resolve merge and Markdown edge cases ([dd13c05](https://github.com/deepseek-ai/deepseek-harness/commit/dd13c0519))
- fix(i18n): localize encoded exact links ([2c94ec6](https://github.com/deepseek-ai/deepseek-harness/commit/2c94ec6cd))
- fix(i18n): align translation briefing link rules ([b7e195a](https://github.com/deepseek-ai/deepseek-harness/commit/b7e195a7e))
- fix(i18n): bind localized links to active pairs ([8a334c4](https://github.com/deepseek-ai/deepseek-harness/commit/8a334c4d4))

### 🔄 Refactoring
- refactor(session-projection): checkpoint every projection unit uniformly ([327b86d](https://github.com/deepseek-ai/deepseek-harness/commit/327b86d2e))
- test(subagent): address continuation cleanup review ([674b3d8](https://github.com/deepseek-ai/deepseek-harness/commit/674b3d8af))
- test(subagent): close persistence handle before deleting temp root ([ea0906a](https://github.com/deepseek-ai/deepseek-harness/commit/ea0906a99))
- refactor(subagent): normalize optional timing output ([da463dd](https://github.com/deepseek-ai/deepseek-harness/commit/da463ddeb))
- refactor(test): simplify session fixture decoding ([f8828ff](https://github.com/deepseek-ai/deepseek-harness/commit/f8828ffe3))
- refactor(test): keep session fixture projection local ([9921de2](https://github.com/deepseek-ai/deepseek-harness/commit/9921de2d0))
- refactor(session-projection): separate state from client views ([4c421ec](https://github.com/deepseek-ai/deepseek-harness/commit/4c421ec88))
- test(llm-deepseek): gate preview vision smoke ([c8815e5](https://github.com/deepseek-ai/deepseek-harness/commit/c8815e50a))
- test(snapshot): address envelope projection review ([eb2c978](https://github.com/deepseek-ai/deepseek-harness/commit/eb2c9780a))
- test(i18n): model reserved paths portably ([00af8d4](https://github.com/deepseek-ai/deepseek-harness/commit/00af8d4f7))
- test(i18n): share structure signature fixture ([0a1a1b9](https://github.com/deepseek-ai/deepseek-harness/commit/0a1a1b937))
- refactor(i18n): remove directory index inference ([f5eb069](https://github.com/deepseek-ai/deepseek-harness/commit/f5eb06915))

### 📝 Documentation
- docs: refresh config catalog source links ([ad94c35](https://github.com/deepseek-ai/deepseek-harness/commit/ad94c35a7))
- docs(i18n): point tutorial entries at index pages ([4f8ff00](https://github.com/deepseek-ai/deepseek-harness/commit/4f8ff004e))

### 🔧 Configuration
- ci: split master-only jobs into ci-master.yml ([61f910d](https://github.com/deepseek-ai/deepseek-harness/commit/61f910d1c))
- chore(knip): drop stale and glob-duplicate workspace entries ([50c22ee](https://github.com/deepseek-ai/deepseek-harness/commit/50c22ee47))
- perf(infra): parallelize hygiene checks ([e850c07](https://github.com/deepseek-ai/deepseek-harness/commit/e850c0769))
- perf(infra): shorten doc-sync critical path ([f4af19d](https://github.com/deepseek-ai/deepseek-harness/commit/f4af19d72))

## 2026-08-20

**75 commits.** 17 feature changes, 29 fixes.

### 🆕 New Features
- feat(web): refine nested subagent header navigation ([0864878](https://github.com/deepseek-ai/deepseek-harness/commit/0864878cd))
- feat(web): refine subagent header switcher ([de572dd](https://github.com/deepseek-ai/deepseek-harness/commit/de572dd91))
- feat(credentials): abstract credentials service and support OAuth login ([aef4e1c](https://github.com/deepseek-ai/deepseek-harness/commit/aef4e1c9b))
- feat(credentials): upgrade the pre-release flat document at boot ([933d1f2](https://github.com/deepseek-ai/deepseek-harness/commit/933d1f2ab))
- feat(llm-pi-ai): sign in to a provider instead of withholding it ([57c5f01](https://github.com/deepseek-ai/deepseek-harness/commit/57c5f017a))
- feat(authorization): obtain a credential by asking the human ([732a736](https://github.com/deepseek-ai/deepseek-harness/commit/732a7361f))
- feat(credentials): store durable credential records beside references ([86a9f8c](https://github.com/deepseek-ai/deepseek-harness/commit/86a9f8c86))
- feat(atomic-write): state the writer-lock wait limit per call ([26a8e6a](https://github.com/deepseek-ai/deepseek-harness/commit/26a8e6a55))
- feat(web): preserve near-full cache-hit precision ([3a9e1a6](https://github.com/deepseek-ai/deepseek-harness/commit/3a9e1a6e2))
- feat(web): answer ask_user_question over multiple lines ([6d62627](https://github.com/deepseek-ai/deepseek-harness/commit/6d6262703), [9616790](https://github.com/deepseek-ai/deepseek-harness/commit/9616790b6))
- feat(webserver): structured index injection table and the client boot seams ([3866791](https://github.com/deepseek-ai/deepseek-harness/commit/386679157), [156bd07](https://github.com/deepseek-ai/deepseek-harness/commit/156bd075a))
- feat(web): wrap markdown tables to the column with an overflow wide view ([e483c9e](https://github.com/deepseek-ai/deepseek-harness/commit/e483c9e30))
- fix(ui-workspace): pin the current blank New Session row first ([e333dfc](https://github.com/deepseek-ai/deepseek-harness/commit/e333dfc8f))
- feat(web): reveal the wide-table scrollbar on hover instead of painting it ([c9ce611](https://github.com/deepseek-ai/deepseek-harness/commit/c9ce61136))
- fix(ui-workspace): promote new sessions only once ([b3b6407](https://github.com/deepseek-ai/deepseek-harness/commit/b3b6407a2))

### 🐛 Bug Fixes
- docs: fix Chinese Agent Note link locale ([d229df5](https://github.com/deepseek-ai/deepseek-harness/commit/d229df59d))
- fix(web): carry the composer edit range from the pre-edit selection ([a67b9a4](https://github.com/deepseek-ai/deepseek-harness/commit/a67b9a4d3), [795d36d](https://github.com/deepseek-ai/deepseek-harness/commit/795d36d68))
- fix(web): render the terminal turn error after same-turn retries exhaust ([5951d19](https://github.com/deepseek-ai/deepseek-harness/commit/5951d19f5))
- fix(web): address subagent header review findings ([5f7ac91](https://github.com/deepseek-ai/deepseek-harness/commit/5f7ac9183))
- fix(frontend-static): return 404 for missing paths ([c71ff38](https://github.com/deepseek-ai/deepseek-harness/commit/c71ff384c), [92723ca](https://github.com/deepseek-ai/deepseek-harness/commit/92723cafe))
- fix(frontend-static): return 404 for a missing index ([600f3a3](https://github.com/deepseek-ai/deepseek-harness/commit/600f3a311))
- docs(i18n): localize links and fix capability-page targets ([e3248cc](https://github.com/deepseek-ai/deepseek-harness/commit/e3248cc89))
- fix(ui-conversation): render the terminal turn error after same-turn retries exhaust ([daaede2](https://github.com/deepseek-ai/deepseek-harness/commit/daaede29a))
- fix(credentials): name reference update event explicitly ([fecfabc](https://github.com/deepseek-ai/deepseek-harness/commit/fecfabcac))
- fix(llm-pi-ai): stub both home spellings in the tilde-expansion test ([0b2bc3d](https://github.com/deepseek-ai/deepseek-harness/commit/0b2bc3d65))
- fix(ci): catch the branch up with the static and smoke gates ([6428b84](https://github.com/deepseek-ai/deepseek-harness/commit/6428b844e))
- fix(credentials,authorization,llm-pi-ai): harden the auth seams per review ([9eaaeae](https://github.com/deepseek-ai/deepseek-harness/commit/9eaaeaeb9))
- fix(web): derive the caret-delete range from what the draft lost ([b2c9c3c](https://github.com/deepseek-ai/deepseek-harness/commit/b2c9c3ce3))
- fix(web): cap the answer field at six text lines in both variants ([7260f4c](https://github.com/deepseek-ai/deepseek-harness/commit/7260f4cf6))
- fix(web): stand down prefetch only when the transport owns bundle bytes ([10f9f50](https://github.com/deepseek-ai/deepseek-harness/commit/10f9f506e))
- fix(test): use unique temp dirs for acp-demo composition persistence ([4347ee1](https://github.com/deepseek-ai/deepseek-harness/commit/4347ee17f))
- fix(cic): cover release-publish in client-build gate and correct group wording ([56a8f7d](https://github.com/deepseek-ai/deepseek-harness/commit/56a8f7d32))
- fix(cic): restore subscription-type gates and note table for split publish ([16affb8](https://github.com/deepseek-ai/deepseek-harness/commit/16affb84f))
- fix(cic): address gray-check PR review - official build, step-level gate, note sync ([63d9de0](https://github.com/deepseek-ai/deepseek-harness/commit/63d9de0eb))
- fix(sandbox): prevent bwrap procfs root escapes ([fe12e04](https://github.com/deepseek-ai/deepseek-harness/commit/fe12e0473))
- fix(ui-workspace): make the blank-session pin render-only and skip masked drags ([d53292b](https://github.com/deepseek-ai/deepseek-harness/commit/d53292b30))
- fix(web): key composer reference decorations by draft order ([d18f4ed](https://github.com/deepseek-ai/deepseek-harness/commit/d18f4ed3d), [99aad0e](https://github.com/deepseek-ai/deepseek-harness/commit/99aad0ebc))
- fix(ui-workspace): pin the current blank New Session row first ([d0b7dea](https://github.com/deepseek-ai/deepseek-harness/commit/d0b7dea8a))
- fix(web): improve permission labels and blank defaults ([4e1b3e4](https://github.com/deepseek-ai/deepseek-harness/commit/4e1b3e4b8))
- fix(docs): drop stale persist field from projection type-equiv block ([bb79203](https://github.com/deepseek-ai/deepseek-harness/commit/bb79203f5))
- fix(sandbox): isolate bwrap PID namespace ([82db151](https://github.com/deepseek-ai/deepseek-harness/commit/82db1515f))

### 🔄 Refactoring
- docs(website): serve index routes at their clean-URL .md addresses ([17c8520](https://github.com/deepseek-ai/deepseek-harness/commit/17c85209a))
- test(gateway): pin the namespace atomic-visibility guarantee ([97f4d46](https://github.com/deepseek-ai/deepseek-harness/commit/97f4d4608))
- test: cover gateway rollback and theme fallback branches ([3ca4997](https://github.com/deepseek-ai/deepseek-harness/commit/3ca4997cd))
- test(web): align blank-session activity snapshot ([9a2dc33](https://github.com/deepseek-ai/deepseek-harness/commit/9a2dc3327))
- refactor(projection): separate host state from client views ([4ea6f4d](https://github.com/deepseek-ai/deepseek-harness/commit/4ea6f4df2))
- test(subagent): rethrow accumulated cleanup errors; register fresh handle ([03d1dea](https://github.com/deepseek-ai/deepseek-harness/commit/03d1dead7))
- test(acp): keep persistent-pwsh-tool-turn fixture in canonical packed layout ([c9f5117](https://github.com/deepseek-ai/deepseek-harness/commit/c9f51173c))
- test: sync permission origin artifacts ([a0bfc2c](https://github.com/deepseek-ai/deepseek-harness/commit/a0bfc2c3f))

### 📝 Documentation
- docs(notes): localize zh note links and widen the closure walk timeout ([68d24f3](https://github.com/deepseek-ai/deepseek-harness/commit/68d24f323))
- docs(website): serve every page as raw Markdown with an llms.txt index ([f3ce821](https://github.com/deepseek-ai/deepseek-harness/commit/f3ce8218c))
- docs(client): align turn-error prose with exhausted-retry rendering ([c3e35cb](https://github.com/deepseek-ai/deepseek-harness/commit/c3e35cbe9))
- docs: remove line numbers from subsystem catalog links ([ed3ef7a](https://github.com/deepseek-ai/deepseek-harness/commit/ed3ef7ace))
- docs(authorization): record the credential-record and flow decisions ([21ea0ed](https://github.com/deepseek-ai/deepseek-harness/commit/21ea0ed9e))
- docs(web): retire tap-era prose across READMEs, subsystems, and notes ([be3a630](https://github.com/deepseek-ai/deepseek-harness/commit/be3a630da))
- docs(web): align injection-surface JSDoc, notes, and bilingual READMEs ([d582939](https://github.com/deepseek-ai/deepseek-harness/commit/d58293978))
- chore(docs): classify IndexInjection and regenerate the catalog surfaces ([d4fd03a](https://github.com/deepseek-ai/deepseek-harness/commit/d4fd03ae5))
- docs(apiproxy): record that a pending question dies with the host ([4562616](https://github.com/deepseek-ai/deepseek-harness/commit/4562616c9))
- docs(notes): record current-blank pinning in the sidebar order note ([9872352](https://github.com/deepseek-ai/deepseek-harness/commit/98723525c))
- docs(e2e): point keyless-gate comment at ci.yml (PR) and ci-master.yml (push) ([77437b1](https://github.com/deepseek-ai/deepseek-harness/commit/77437b1f5))

### 🔧 Configuration
- chore(release): carry dsh-authorization to the rc.8 family version ([30289d6](https://github.com/deepseek-ai/deepseek-harness/commit/30289d632))
- chore(sync): regenerate the module graph after the projection merges ([564e4d1](https://github.com/deepseek-ai/deepseek-harness/commit/564e4d161))
- chore(sync): regenerate the event matrix after the command-envelope merge ([7d04a02](https://github.com/deepseek-ai/deepseek-harness/commit/7d04a0235))
- chore(sync): restore the image-budget README merge on llm-pi-ai ([120097e](https://github.com/deepseek-ai/deepseek-harness/commit/120097e26))
- chore(release): carry dsh-authorization to the rc.7 family version ([a190ef5](https://github.com/deepseek-ai/deepseek-harness/commit/a190ef580))
- chore(sync): re-record the packages README pairing after the cascade ([29a8254](https://github.com/deepseek-ai/deepseek-harness/commit/29a82543e))
- ci: stop PR gray checks from lifecycle and release publish jobs ([f5faeae](https://github.com/deepseek-ai/deepseek-harness/commit/f5faeae4d), [a33ed4d](https://github.com/deepseek-ai/deepseek-harness/commit/a33ed4ddf))
- ci: split master-only jobs into ci-master.yml ([297fff6](https://github.com/deepseek-ai/deepseek-harness/commit/297fff6e9))
- Trim knip.json to 655 lines by removing 15 stale or glob-duplicate workspace entries. Behavior-neutral under knip's specificity-based workspace config selection; CI green, issue policy green, review threads resolved. ([a42102f](https://github.com/deepseek-ai/deepseek-harness/commit/a42102fb2))

## 2026-08-21

**50 commits.** 7 feature changes, 16 fixes.

### 🆕 New Features
- feat(attachment): add normalized image and Files API pipeline ([272ffff](https://github.com/deepseek-ai/deepseek-harness/commit/272ffffdd))
- feat(images): expand source upload envelope ([72b204a](https://github.com/deepseek-ai/deepseek-harness/commit/72b204afa))
- feat(images): unify master and Files request pipeline ([d29855f](https://github.com/deepseek-ai/deepseek-harness/commit/d29855f97))
- feat(tool-fs): read_image reports downscaled dimensions and coordinate scale ([6e17c20](https://github.com/deepseek-ai/deepseek-harness/commit/6e17c2080))
- feat(attachment-local): store a deterministic canonical image encoding ([83a526e](https://github.com/deepseek-ai/deepseek-harness/commit/83a526eea))
- docs(website): serve every page as raw Markdown with an llms.txt index ([a760c0b](https://github.com/deepseek-ai/deepseek-harness/commit/a760c0b0f))
- feat(llm-deepseek): publish the vision model ([e637bcf](https://github.com/deepseek-ai/deepseek-harness/commit/e637bcfb9))

### 🐛 Bug Fixes
- fix(deepseek): decouple files and stream timeouts ([d618bfe](https://github.com/deepseek-ai/deepseek-harness/commit/d618bfebb))
- fix(llm-deepseek): fall back when Files resolution fails ([1b38979](https://github.com/deepseek-ai/deepseek-harness/commit/1b389798d))
- fix(attachment): accept opaque WebP alpha omission ([e30d92a](https://github.com/deepseek-ai/deepseek-harness/commit/e30d92a03))
- revert: undo #2608 permission labels and blank defaults ([577bb71](https://github.com/deepseek-ai/deepseek-harness/commit/577bb7141))
- Revert "Merge pull request #2608 from deepseek-harness/fix/permission-copy-and-default" ([7ce8528](https://github.com/deepseek-ai/deepseek-harness/commit/7ce85283b))
- docs(i18n): fix rebased image note links ([6a27286](https://github.com/deepseek-ai/deepseek-harness/commit/6a27286e4))
- fix(images): address unified pipeline review ([48a58b9](https://github.com/deepseek-ai/deepseek-harness/commit/48a58b909))
- fix(images): parse listed missing Files ids ([c09a42c](https://github.com/deepseek-ai/deepseek-harness/commit/c09a42ccb))
- fix(attachment-local): exclude metadata carriers and animation from passthrough; validate the canonical budget up front ([118f244](https://github.com/deepseek-ai/deepseek-harness/commit/118f24442))
- fix(attachment-local): keep reference field order stable for logged fixtures ([c6fa512](https://github.com/deepseek-ai/deepseek-harness/commit/c6fa512e1))
- fix: ci ([60e44b2](https://github.com/deepseek-ai/deepseek-harness/commit/60e44b2d7))
- test(subagent): close persistence handle before deleting temp root ([b7135e6](https://github.com/deepseek-ai/deepseek-harness/commit/b7135e620))
- fix(build): support standalone pnpm entrypoints ([d508a09](https://github.com/deepseek-ai/deepseek-harness/commit/d508a0995), [89674ed](https://github.com/deepseek-ai/deepseek-harness/commit/89674edc9))
- fix(llm-deepseek): address vision catalog review ([708a25a](https://github.com/deepseek-ai/deepseek-harness/commit/708a25a8a))
- docs: fix Chinese Agent Note link locale ([0e40664](https://github.com/deepseek-ai/deepseek-harness/commit/0e40664c6))

### 🔄 Refactoring
- test: sync reverted permission snapshot ([32f3c09](https://github.com/deepseek-ai/deepseek-harness/commit/32f3c09c2))
- test(snapshot): stabilize persisted-turn coverage ([6816cc0](https://github.com/deepseek-ai/deepseek-harness/commit/6816cc0b0))
- test(composition): remove retired image-region tool ([cbc830a](https://github.com/deepseek-ai/deepseek-harness/commit/cbc830ade))
- refactor(attachment): normalize image storage API ([2491e12](https://github.com/deepseek-ai/deepseek-harness/commit/2491e12fd))
- refactor(image): remove region reads ([724783b](https://github.com/deepseek-ai/deepseek-harness/commit/724783b02))
- test(deepseek): print vision failure facts ([0c9a664](https://github.com/deepseek-ai/deepseek-harness/commit/0c9a66422))
- test(deepseek): expose Files API e2e failures ([703ce4a](https://github.com/deepseek-ai/deepseek-harness/commit/703ce4a3d))
- test(images): close unified pipeline coverage gaps ([d65e2a9](https://github.com/deepseek-ai/deepseek-harness/commit/d65e2a9e8))
- test(images): cover attachment projection edges ([657ec56](https://github.com/deepseek-ai/deepseek-harness/commit/657ec56fb))
- refactor(attachment): saveImage returns the canonical ref beside source facts ([8f83853](https://github.com/deepseek-ai/deepseek-harness/commit/8f83853b6))
- test: omit persistence envelopes from session snapshots ([d72713c](https://github.com/deepseek-ai/deepseek-harness/commit/d72713c1b))
- test(ci): deduplicate coverage command setup ([4b086d0](https://github.com/deepseek-ai/deepseek-harness/commit/4b086d0a4))
- test(ci): exercise standalone pnpm on Windows ([4f28684](https://github.com/deepseek-ai/deepseek-harness/commit/4f2868409))

### 📝 Documentation
- docs: refresh image pipeline module graph ([de8ea5d](https://github.com/deepseek-ai/deepseek-harness/commit/de8ea5d71))
- docs: propose attachment read quarantine ([c1bdac6](https://github.com/deepseek-ai/deepseek-harness/commit/c1bdac693))
- docs: bring the zh config catalog along; pin read_image source fields in the code-mode prompt sidecar ([c90a944](https://github.com/deepseek-ai/deepseek-harness/commit/c90a944ab))
- docs(notes): record the canonical image admission decision ([867dc44](https://github.com/deepseek-ai/deepseek-harness/commit/867dc4469))
- docs(attachment): document canonical admission; pin wide-image acceptance snapshot ([fec8aa6](https://github.com/deepseek-ai/deepseek-harness/commit/fec8aa62d))
- docs(llm): anchor unified request-image management design PR ([92a9741](https://github.com/deepseek-ai/deepseek-harness/commit/92a974105))
- ci(docs): 文档站改为从发布 tag 发布 ([f4b080f](https://github.com/deepseek-ai/deepseek-harness/commit/f4b080ffe))
- ci(docs): publish the documentation site from a release tag ([fa3e379](https://github.com/deepseek-ai/deepseek-harness/commit/fa3e37982))

### 🔧 Configuration
- release: dsh@0.1.1-rc.2 ([b150a55](https://github.com/deepseek-ai/deepseek-harness/commit/b150a551b))
- release(dsh): 0.1.1-rc.2 ([aa6c361](https://github.com/deepseek-ai/deepseek-harness/commit/aa6c361a9))
- chore(images): align merged runtime closure ([c0dd8ec](https://github.com/deepseek-ai/deepseek-harness/commit/c0dd8ec82))
- release: dsh@0.1.1-rc.1 ([528c682](https://github.com/deepseek-ai/deepseek-harness/commit/528c682e0))
- release(dsh): 0.1.1-rc.1 ([3ec5e8f](https://github.com/deepseek-ai/deepseek-harness/commit/3ec5e8f8c))
- perf(infra): shorten doc-sync critical path ([b70f27f](https://github.com/deepseek-ai/deepseek-harness/commit/b70f27f76))
