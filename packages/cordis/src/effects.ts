/**
 * Section 5.1.1: effect tracking (Algorithm 1). Every context mutation in the
 * framework reduces to a ctx.effect call, so anything performed through a
 * context is automatically tracked and recovered on unload. This realizes
 * effect^iter_Γ (Definition 52): a callback of type 𝔈^iter_Γ lifts to
 * 𝔈^iter_{∂Γ} and yields a dispose closure that recovers the effect.
 *
 * The runtime does NOT check the 𝔈*_Γ witness: supplying an inverse that
 * recovers its own effect is the component author's obligation (Theorem 61
 * appeals to it; §6.1 delimits it).
 */

/** A disposer: the inverse of one effect (g : Γ → Γ, realized as cleanup). */
export type Disposer = () => void | Promise<void>

/** The no-op inverse: idΓ. */
export const noop: Disposer = () => {}

/**
 * f ∘ g: the disposer that runs f first, then g. Prepending a new inverse
 * therefore recovers effects in LIFO order (Algorithm 1 line 6).
 */
export const composeDisposers = (newer: Disposer, older: Disposer): Disposer => async () => {
  await newer()
  await older()
}

/** The effect callback: 𝔈_Γ (a single inverse) or 𝔈^iter_Γ (an iterator). */
export type EffectCallback = () =>
  | Disposer
  | Promise<Disposer>
  | AsyncIterable<Disposer>
  | Promise<AsyncIterable<Disposer>>

const toIterable = async (result: ReturnType<EffectCallback>): Promise<AsyncIterator<Disposer>> => {
  const awaited = await result
  if (typeof awaited === 'function') {
    return (async function* () {
      yield awaited
    })()[Symbol.asyncIterator]()
  }
  return awaited[Symbol.asyncIterator]()
}

/**
 * execute (Algorithm 1): drive the callback as an effect iterator, folding the
 * inverse yielded at each step into one composite. Admission is synchronous —
 * the guard is consulted when the effect is invoked, so an effect registered
 * by a running component cannot be skipped — and afterwards it is consulted
 * at each iteration boundary; once it trips, iteration stops and only the
 * accumulated inverses remain (§4.3.2). A rejected iteration is a raise
 * (𝔈^fail_Γ) and propagates to the caller with the partial inverse attached.
 */
export const execute = (callback: EffectCallback, guard: () => boolean): Promise<Disposer> => {
  if (!guard()) return Promise.resolve(noop) // never admitted
  const iterPromise = toIterable(callback()) // the application runs now
  const run = async (): Promise<Disposer> => {
    const iter = await iterPromise
    let inverse: Disposer = noop
    try {
      for (;;) {
        const step = await iter.next()
        if (step.done) break
        if (step.value !== undefined) {
          inverse = composeDisposers(step.value, inverse) // prepend: LIFO recovery
        }
        if (!guard()) {
          // Stop at the iteration boundary. Fire-and-forget return(): it runs
          // the iterator's finally blocks without delaying recovery, and a
          // generator suspended at a yield resolves it immediately.
          void iter.return?.().catch(() => {})
          break
        }
      }
    } catch (error) {
      // A raise (𝔈^fail_Γ): attach the partial inverse so the caller can recover
      // what was installed before the failure (L-Raise recovers before it records).
      ;(error as { inverse?: Disposer }).inverse = inverse
      throw error
    }
    return inverse
  }
  return run()
}

/**
 * effect(ctx, callback) (Algorithm 1): self-disposing wrapper over execute.
 * The task starts eagerly; the returned dispose halts any in-flight iteration
 * at its next step boundary and fires recovery at most once (firing twice
 * would apply an inverse at a state no application produced). A raise inside
 * the callback leaves recovery empty — the fiber records the error (§4.3.4).
 */
export const trackEffect = (callback: EffectCallback): Disposer => {
  let armed = true
  let disposed = false
  let recovery: Disposer = noop
  const task = execute(callback, () => armed).then((recover) => {
    recovery = recover
    return recover
  })
  return async () => {
    if (disposed) return
    disposed = true
    armed = false
    await task.catch(() => {})
    await recovery()
  }
}
