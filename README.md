**Harness Agent using deepseek-v4-flash + high thinking.**

# 📄 Paper2Code → Cordis
## Pipeline stages

| Stage | Script | Agent | Output |
|---|---|---|---|
| 1. Planning | `codes/1_planning.py` | Project architect | overall plan, file list, mermaid class/sequence diagrams, `planning_config.yaml` |
| 1.1 Config | `codes/1.1_extract_config.py` | — | extracts `config.yaml` from planning responses |
| 2. Analyzing | `codes/2_analyzing.py` | System analyst | per-file logic analyses (`analyzing_artifacts/`) |
| 3. Coding | `codes/3_coding.py` | Software engineer | the repository, file-by-file in dependency order |

Human-in-the-loop: the planning stage records **"Anything UNCLEAR"** items (see `planning_response.json`); the generated repo ships them as [`outputs/Cordis_repo/UNCLEAR_ASSUMPTIONS.md`](outputs/Cordis_repo/UNCLEAR_ASSUMPTIONS.md).

### Local modifications to the stock pipeline
- `tools/pdf_to_s2orc_json.py` — lightweight PDF→S2ORC-JSON converter (replaces the Grobid/s2orc-doc2json Java dependency).
- DeepSeek support in `codes/{1_planning,2_analyzing,3_coding}.py` (`reasoning_effort="high"`) and accurate cache-hit cost accounting in `codes/utils.py`.
- TypeScript output: the coding prompts emit TypeScript (`.ts` file lists), including a fix for nested `src/…` paths in `2_analyzing.py`.

---

## The generated reproduction: Cordis in TypeScript

`outputs/Cordis_repo/` re-implements the paper's formal contributions:

- **Revertible effects** — `ctx.effect` with LIFO inverse composition and guard-checked iteration (`src/effect.ts`)
- **Reactive coeffects** — realm isolation, interception, and dependency notification (`src/coeffect.ts`)
- **Inertial fiber lifecycle** — guarded withdrawal, committed-view fixity, failure recovery (`src/fiber.ts`, `src/lifecycle.ts`)
- **Declarative loader** — keyed reconciliation and managed isolation realms, Algorithm 7 (`src/loader.ts`)
- **Transactional HMR** — module classification, stale-entry detection, atomic rollback, Algorithms 8–10 (`src/hmr.ts`)

Status: `tsc --noEmit` clean, **16/16 tests passing** (`vitest` + `fast-check` properties for recovery exactness, activation/withdrawal ordering, resolution coherence, progress, confluence), `npm start` smoke test green.

---

## License & attribution
- Pipeline code: [MIT](LICENSE) (upstream [going-doer/Paper2Code](https://github.com/going-doer/Paper2Code)).
- The Cordis reproduction was generated with PaperCoder using `deepseek-v4-flash`; the paper itself is by Yifan Shi, Wei Zhang & Tianyi Cui (Peking University / DeepSeek-AI).
