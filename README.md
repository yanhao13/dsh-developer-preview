**Agent Harness using deepseek-v4-pro + max thinking.**

# A Programming Paradigm for Spatiotemporal Composability

An executable implementation of Shi, Zhang & Cui's paper (the formal paper
behind [Cordis](https://github.com/cordiverse/paper)): the spacetime calculus
of Sections 3–4 as a pure, tested reference library, and a full framework
mirroring Cordis per Section 5, with the paper's metatheorems encoded as
runnable checks and its motivating examples as a runnable demo.

```
pnpm install
pnpm run test        # 51 tests: every numbered item below is exercised
pnpm run typecheck   # strict TypeScript, both packages
pnpm run demo        # the paper's motivating examples (Sections 1.2, 5.2)
```

## Packages

### `spacetime-calculus` — Sections 3 and 4, exactly

The calculus is a faithful encoding of the paper's definitions. Each source
file cites the definition/theorem numbers; each test block is one theorem.

| File | Paper | Contents |
|---|---|---|
| `src/core.ts` | §3.1 | 𝔗Γ twisted monoid (Def 1), ∂Γ effect context (Def 2), `track` (Def 3), `recover` (Def 6), 𝔈Γ / ⋄ / η (Defs 8–9), `effect` lift (Def 12) |
| `src/effects.ts` | §3.1.2–3 | 𝔈*Γ witness check (Def 8), transformation monoids 𝔐(e) (Def 17), independence (Def 19), `applySequence` |
| `src/coeffects.ts` | §3.2 | Σ (Def 22), `get`/`set` with preconditions (Def 23), operation lifts `aΣ(x)` (Def 24), satisfaction `σ ⊨ d` (formula 24), `notify_d` (Def 26), Σiso realms (Defs 28–29), Σinter metadata (Defs 30–31), coeffect-mediated effects (Def 41) |
| `src/context.ts` | §3.3 | Γ∞ (Def 32), observational equivalence (Def 33), respects/related maps (Def 36), witnessed-up-to-≃ (Def 37), Theorem 7 up to ≃ (Lemma 38) |
| `src/calculus.ts` | §4 | components/fibers/registry (Defs 43–45), target views + quiet (Def 46), the ten rules (O-Insert/O-Retire/O-Remove, L-Begin/L-Iter/L-Finish/L-Divert/L-Raise/L-Leave/L-Unload), relied (Def 46), ≈ and ≃ (Def 53), well-formedness (Def 58), the support set (Def 67) |

**Metatheorems as executable checks** (`test/`): every equality is checked
exhaustively over a small finite context instantiation (Γ = {x,y} ∈ {0,1,2}²,
all tables over small key/value domains), and the §4 machine is driven under
random schedules.

- Theorem 4, 5, 7, 10, 11, 13, 14, 15, 16, 20, Cor 21 — `effects.test.ts`
- Definitions 23–31, Theorem 40, Theorem 42 — `coeffects.test.ts`
- Definitions 32–38 — `context.test.ts`
- Preservation (Thm 59), Recovery exactness (Cor 62), Ordering (Thm 63),
  Progress (Thm 66, including the `S(n) ≤ (K+4)(V(n)+1)` bound), Confluence
  (Thm 73), Lemma 70, Definition 47, §4.3.4 failure, ≈ vs ≃ — `calculus.test.ts`

### `spacetime-cordis` — Section 5, the Cordis mirror

The framework mirrors the paper's algorithms one-to-one (Table 2 of the
paper):

| File | Paper | Contents |
|---|---|---|
| `src/effects.ts` | Algorithm 1 | `execute(callback, guard)` — the effect iterator with LIFO inverse composition, synchronous admission, and boundary guard; `trackEffect` — self-disposing effects; raises carry their partial inverse (L-Raise) |
| `src/context.ts` | Algorithms 2–6 | the context Γ∞: `get`/`set` (Alg 2), reactive `notify` (Alg 3), `use` (Alg 4), the lifecycle `refresh`/`reload`/`unload` (Alg 5) with the Theorem 63 ordering (UNLOADING marked before scheduling; the dependents drain before recovery; the committed view outlives the fiber's teardown), proxy-mediated access with INACTIVE/UNDECLARED rejection (Alg 6), `isolate`/`intercept` as derived realizations (Def 27) |
| `src/events.ts` | §5.1 note | events as coeffect keys: subscriptions are tracked effects, withdrawn on unload |
| `src/loader.ts` | §5.2.1 | entries (Def 74), incremental reconciliation with per-field dispatch, delimiter-based realm reassignment (Algorithm 7) |
| `src/hmr.ts` | §5.2.2 | module classification (Alg 8), stale detection (Alg 9), transactional reload with rollback (Alg 10) |

`test/effects.test.ts` exercises Algorithm 1; `test/context-lifecycle.test.ts`
exercises Algorithms 2–6 including the ordering theorem and failure;
`test/loader-hmr.test.ts` exercises Algorithms 7–10. `demo/main.ts` runs the
paper's motivating examples end to end: the VSCode plugin host (live unload +
re-enable), the agent harness (provider swap with preserved process state),
the coarse-grained-workaround contrast, and HMR with rollback.

## Deliberate deviations (documented in code)

- `ctx.set` overwrites an existing binding (Algorithm 2), while the calculus's
  `setEffect` enforces Definition 23's no-double-provision precondition —
  the two layers implement their respective sections verbatim.
- Interception metadata merges by replacement with the newest taking priority
  (the ⊕k instance for opaque metadata).
- The framework's fiber accumulator closures differ between runs by
  construction (each folds its own inverses), so the confluence check compares
  the paper's ≃ fields (tables, ω, τ, π, θ.kind) rather than closure identity.

## Sources

- The paper: `.workbuddy/paper/paper.pdf` (extracted text `paper.txt`).
- Section-by-section specifications extracted for this implementation:
  `.workbuddy/paper/spec-3-effects-coeffects.md`, `spec-4-calculus.md`,
  `spec-5-implementation.md`.
