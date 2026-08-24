# docs-changelog — processing notes

- **Version routing:** `v0.1.1-rc.2` is not nightly and does not end in `.0` → **Path B**; the `rc` tag routes to **B.2 (Preview Patch)** with target file `preview.md`.
- **TIME processed:** `2026-08-21T12:03:00Z` → `2026-08-21` / `August 21, 2026` (HEAD commit 2026-08-21T20:03+08:00).
- **BODY processing:** PR URLs were reformatted to markdown links with the PR number as text; no "New Contributors" section existed in the input, so none was deleted; the Full Changelog link is preserved.
- **Highlights:** 5 bold-titled points; PR numbers, links, and author names are stripped per the stable/preview highlight guidelines.
- **Finalize:** `npm run format` step is N/A for these generated files (no repo formatter ran; files were written already formatted).
- **Stripping applied:** author names removed from highlights; internal tracking IDs (PR numbers) appear only in the What's Changed links, as the skill prescribes for preview pages.
