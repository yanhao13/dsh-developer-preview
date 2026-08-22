# Unclear Assumptions & Human-in-the-Loop Record

PaperCoder's Planning phase was asked to flag anything the paper leaves
unspecified ("Anything UNCLEAR" fields in `planning_response.json`). This file
records those items and how the generated implementation resolved them. Review
and adjust the resolutions before treating the repository as authoritative.

Source: `../outputs/Cordis/planning_response.json` (Planning responses #2 and #3).

## Items flagged by the Planner

1. **Interception metadata merge semantics**
   The paper does not specify the merge for interception metadata beyond
   right-bias. Resolution: default right-biased overwrite for plain records;
   per-key custom merge functions are supported via `ctx.intercept`.

2. **`provided(fiber)` computation**
   The formal model does not track which keys a component actually wrote.
   Resolution: `Lifecycle.providedKeys` returns the union of the declared
   `provide` set and keys observed in the store after activation
   (`syncRuntimeProvided`), reset on unload.

3. **HMR import graph**
   Without bundler hooks the paper's HMR algorithm cannot reliably follow
   dynamic imports or virtual modules. Resolution: a conservative static
   scanner (`HMR.getImports`) covering static `import`/`export from`/
   `require`/literal `import()`; everything else is treated conservatively.

4. **Observational equivalence `≃`**
   State equivalence is application-defined. Resolution: property tests use
   deep equality with a per-key equivalence hook.

## Items resolved during verification (manual fixes)

5. **Effect-callback protocol ambiguity** — `EffectCallback` unions an async
   generator with a plain inverse function. `Lifecycle.use` normalizes
   `Component.apply` results so `fiber.apply` always produces a valid callback.

6. **Lifecycle registry scoping** — the fiber registry is keyed per root
   context tree so independent applications never observe each other's fibers.

7. **Binding ownership on replacement** — a `ctx.set` inverse only deletes its
   own binding (`ownersFor`), so an old provider's teardown cannot erase a
   replacement provider's binding during provider swap.

8. **HMR transactionality** — rollback recreates fibers from the loader's
   captured component objects (not module-cache state), and waits for new
   fibers to settle in `ACTIVE` rather than terminal state.
