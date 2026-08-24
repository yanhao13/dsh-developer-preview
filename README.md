# Code-Change Tracking — 5 Tools Applied to `master@{3day}...master`

**Window resolved:** GitHub's `master@{3day}` = commit `141eb6fe` (2026-08-19T23:11+08:00); `master` = `b150a551` (2026-08-21T20:03+08:00, the dsh-0.1.1-rc.2 release merge).
**Verified counts:** 207 commits · 2,416 changed files (102 added, 6 deleted, 2,303 modified, 5 renamed) — matches the stated "Commits 207, Files changed 2,416".
**Source data:** blobless clone `dsh-upstream/` (full commit/tree history, blobs fetched on demand).

## Applied matrix

| Tool | Input Source (this run) | Primary Function Applied | Ideal Lifecycle Step | Artifact |
|------|-------------------------|--------------------------|----------------------|----------|
| `pr-reference` | Local git history: `141eb6fe..b150a551` | Generated `<commit_history>` XML with 207 commits and the full unified diff of 2,416 files; companion file table + chunk index | Development — preparing a submission | [`pr-reference/pr-reference.xml`](pr-reference/pr-reference.xml) (see stats below) |
| `change` | Workspace delta: 2,421 committed paths → 230 changed `@deepseek-ai/dsh-*` packages | Classified each changed package `minor`/`patch`/`none` and emitted beachball-schema change files + repo-native `change-scope.json` | Commit — categorizing semantic per-package changes | [`change/`](change/) (230 JSON change files + report) |
| `wiki-changelog` | Historical git log lines: 207 commits (173 kept after noise-merge filtering) | Grouped by day (Aug 10–21) into the 7 emoji categories with linked commit hashes | Tracking — monitoring development updates | [`wiki-changelog/wiki-changelog.md`](wiki-changelog/wiki-changelog.md) |
| `write-changelog` | Closed milestone items: first-parent PR chain of the window (31 merges/Pushes = 20 PRs + 11 direct commits) | Aggregated PR titles into Changes (11) / Fixes (9) / Thank You (0 — all internal) / Skip (11) draft for `## 0.1.1-rc.2` | Release — building early release draft outlines | [`write-changelog/CHANGELOG.draft.md`](write-changelog/CHANGELOG.draft.md) |
| `docs-changelog` | Automated release strings: `v0.1.1-rc.2` + `2026-08-21` + processed What's Changed body | Path B.2 (preview patch): 5 stripped highlights, `preview.md`, `index.md` announcement with 3 PR links, Full Changelog = this compare URL | Deployment — publishing public announcements | [`docs-changelog/preview.md`](docs-changelog/preview.md), [`docs-changelog/index.md`](docs-changelog/index.md) |

## Artifact inventory

| Artifact | Contents |
|----------|----------|
| `pr-reference/pr-reference.xml` | `<commit_history>` XML: 207 `<commit>` elements (subject+body CDATA), `<full_diff>` of the 2,416-file window |
| `pr-reference/list-changed-files.md` | Markdown table of all 2,416 files with change type (`added`/`modified`/`deleted`/`renamed`), sorted |
| `pr-reference/chunk-info.txt` | Diff line count and 500-line chunk breakdown (`read-diff.sh --info` equivalent) |
| `change/change-scope.json` | Repo-native `scripts/change-scope.ts` `ChangeScopeReport` schema: base/head/mergeBase + 2,421 committed paths |
| `change/*.json` (230) | Beachball-schema change files `{type, comment, packageName, email, dependentChangeType}` — 34 minor / 196 patch |
| `change/CHANGE-REPORT.md` | Per-package classification evidence (A/M/D/R counts, sample subject, type rule) + non-workspace areas |
| `wiki-changelog/wiki-changelog.md` | Daily sections with category bullets, merged duplicates, linked commit hashes, per-day overview line |
| `write-changelog/CHANGELOG.draft.md` | `## 0.1.1-rc.2` entry in the skill's exact format (Changes / Fixes / Thank You / Skip) |
| `docs-changelog/preview.md` | `# Preview release: v0.1.1-rc.2`, 5 bold-titled highlights (no PR numbers/authors), What's Changed with `[#N](url)` links, Full Changelog |
| `docs-changelog/index.md` | Announcement entry with 3 PR links + Full Changelog link |
| `docs-changelog/processing-notes.md` | Version routing (Path B.2), TIME/BODY processing, strip rules applied |

## Tool-to-tool handoffs (lifecycle pipeline)

```
pr-reference ──(2,421 paths)──▶ change ──(207 commits)──▶ wiki-changelog
                                  │
                                  └──(PR buckets)──▶ write-changelog ──(v0.1.1-rc.2 + body)──▶ docs-changelog
```

## Adaptation notes (verified against each skill's SKILL.md)

- **pr-reference** (hve-core): output path defaults to `.copilot-tracking/pr/pr-reference.xml`; here it lands in
  `pr-reference/`. The `list-changed-files` / `read-diff` companions were applied as specified.
- **change** (fluentui): the repo has no beachball (`yarn change` N/A); the equivalent repo-native gate is
  `scripts/change-scope.ts`, so its JSON report is included alongside beachball-schema change files.
  `major` was never assigned (skill rule: requires explicit approval). No package is `none` because every
  changed package also touches non-test files; docs/test-only deltas live in non-workspace areas instead.
- **wiki-changelog** (microsoft/skills deep-wiki): `REPO_URL` resolved from `git remote get-url origin`;
  commit hashes are linked; noise merges ("Merge remote-tracking branch", "# Conflicts:") were dropped and
  duplicate descriptions merged per the skill's constraints.
- **write-changelog** (vscode-pull-request-github): milestone search queries are replaced by the equivalent
  first-parent chain over the window (all PRs merge from `deepseek-harness/*`, so Thank You is empty and its
  section is omitted, as the skill requires for empty buckets). Fixes carry no issue URLs because the PRs
  don't reference issues.
- **docs-changelog** (gemini-cli): `rc` release → Path B.2 preview patch, target `preview.md`; highlights
  strip PR numbers, links, and author names; What's Changed keeps `[#N](url)` formatting; the Full Changelog
  link is the requested compare URL.
