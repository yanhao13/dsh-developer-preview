# 📄 Paper2Code — Automating Code Generation from Scientific Papers (with a Cordis reproduction)

This repository contains two things:

1. **PaperCoder**, the multi-agent pipeline from the [Paper2Code](https://github.com/going-doer/Paper2Code) paper (Seo, Baek, Lee & Hwang — ICLR 2026, [arXiv:2504.17192](https://arxiv.org/abs/2504.17192)). It turns a scientific paper (PDF/LaTeX/JSON) into a code repository through three stages: **Planning** (project architect → blueprint + `config.yaml`), **Analyzing** (system analyst → per-file functional specs), and **Coding** (software engineer → dependency-ordered repository synthesis).

2. **A complete reproduction it generated**: a TypeScript re-implementation of *"A Programming Paradigm for Spatiotemporal Composability"* (the Cordis meta-framework paper, [cordiverse/paper](https://github.com/cordiverse/paper)) — see [`outputs/Cordis_repo/`](outputs/Cordis_repo/).

---

## 🚀 Quick start

### Prerequisites
- Python 3.10+ (pipeline), Node 18+ (generated repo)
- An LLM API key. The stock pipeline calls the OpenAI API; any OpenAI-compatible endpoint works by setting `OPENAI_BASE_URL`. This reproduction was generated with **DeepSeek `deepseek-v4-flash`** (high reasoning) — see [Backend configuration](#backend-configuration).

### 1. Pipeline environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt          # openai, vllm, transformers, tiktoken
cp .env.example .env                     # then fill in your key
```

### 2. Run the pipeline on a paper

Convert a PDF to the S2ORC-style JSON the pipeline expects (no Grobid/Java needed):

```bash
python tools/pdf_to_s2orc_json.py \
    --pdf_path paper.pdf \
    --output_json_path examples/Cordis_paper.json \
    --paper_id Cordis
```

Then run the three-stage pipeline (script adapted from `scripts/run.sh`):

```bash
cd scripts
bash run_cordis.sh                      # Planning → config extraction → Analyzing → Coding
```

The run writes:

```
outputs/
├── Cordis/            # run artifacts: planning/analyzing/coding_artifacts, cost_info.log
└── Cordis_repo/       # ← the generated repository (final deliverable)
```

### 3. Run the generated repository

```bash
cd outputs/Cordis_repo
npm install
npm run typecheck      # tsc --noEmit
npm test               # vitest: 10 core-semantics tests + 6 property-based tests
npm start              # end-to-end smoke test (dependency activation, cascaded unload, HMR)
```

---

## Backend configuration

The pipeline scripts read `OPENAI_API_KEY` (and the SDK honors `OPENAI_BASE_URL`). For a DeepSeek backend:

```bash
export OPENAI_API_KEY="<deepseek key>"
export OPENAI_BASE_URL="https://api.deepseek.com"
cd scripts
bash run_cordis.sh
```

> Model and reasoning settings live in `scripts/run_cordis.sh` (`GPT_VERSION="deepseek-v4-flash"`); the pipeline's `api_call` passes `reasoning_effort="high"` for `o3-mini`/`deepseek` model names.

> **Security:** never commit `.env` (gitignored). The `.env` in this checkout contains a working key and must not be published.

---

## Pipeline stages (PaperCoder)

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
