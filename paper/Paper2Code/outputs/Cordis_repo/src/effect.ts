/**
 * src/effect.ts
 *
 * Revertible effect tracking — the runtime counterpart of the paper's `𝔈iter Γ`
 * and `effectΓ` (Section 3.1, Algorithm 1, Section 5.1.1).
 *
 * The single primitive `ctx.effect` is implemented here.  Every context
 * mutation in Cordis ultimately flows through `EffectEngine.effect`, which
 * guarantees:
 *
 * 1.  **LIFO inverse composition** — within one effect and across effects on
 *     the same context, the most recently registered inverse runs first.
 * 2.  **Guard-checked iteration** — an effect iterator is advanced only while
 *     the supplied guard is true, enabling step-boundary interruption.
 * 3.  **Idempotent disposal** — an effect's inverse runs at most once.
 * 4.  **Parent context registration** — after an effect is recovered (or when
 *     the parent context unwinds), its disposer is prepended to the enclosing
 *     context's accumulator.
 */

import type { Context } from './context';
import type {
  Dispose,
  EffectCallback,
  EffectIterator,
  Guard,
  Inverse,
} from './types';

/**
 * The effect engine.
 *
 * All methods are static and deliberately side-effect free apart from the
 * context mutations they perform through `EffectEngine.effect`.
 */
export class EffectEngine {
  /**
   * The identity disposer.
   *
   * Recovery of an effect with no performed steps is a no-op.
   */
  static identity(): Dispose {
    return () => {
      /* intentionally empty */
    };
  }

  /**
   * Composes two disposers into one.
   *
   * LIFO convention: the returned disposer runs `a` first, then `b`.
   * When an accumulated inverse is built as `compose(newInverse, oldInverse)`,
   * the newest inverse is therefore executed before older inverses.
   *
   * Both disposers are attempted even if one fails.  The first error is
   * preserved and rethrown after all cleanup has been attempted.
   */
  static compose(a: Dispose, b: Dispose): Dispose {
    return async () => {
      let firstError: unknown;

      try {
        await a();
      } catch (error) {
        firstError = error;
      }

      try {
        await b();
      } catch (error) {
        if (firstError === undefined) {
          firstError = error;
        }
      }

      if (firstError !== undefined) {
        throw firstError;
      }
    };
  }

  /**
   * Drives an effect callback as an effect iterator.
   *
   * The callback is called once to obtain either an async generator of
   * inverses or a plain one-shot inverse function.  Each yielded inverse is
   * folded into the accumulated disposer in LIFO order.
   *
   * The guard is consulted before each iteration:
   *
   * - If the guard is already false when `execute` is called, the callback is
   *   not invoked and the identity disposer is returned.
   * - If the guard becomes false while an iteration is in flight, the
   *   yielded inverse from that completed iteration is still composed, but no
   *   further iterations run.
   *
   * Errors thrown by the callback or by an iterator's `next()` propagate to
   * the caller.  Inverses that were already yielded are *not* automatically
   * run here; the caller (for example the fiber lifecycle's L-Raise path) is
   * responsible for recovering from a failed activation using the inverses it
   * has already collected.
   */
  static async execute(callback: EffectCallback, guard: Guard): Promise<Dispose> {
    if (!guard()) {
      return EffectEngine.identity();
    }

    const result = callback();
    const iterator = toAsyncIterator(result);

    let inverse: Dispose = EffectEngine.identity();

    while (guard()) {
      const step = await iterator.next();

      if (step.done) {
        break;
      }

      const value = step.value;

      // Only functions are valid inverses.  This check also protects against
      // accidental yields of `0`, `''`, `false`, etc.
      if (typeof value === 'function') {
        inverse = EffectEngine.compose(value as Dispose, inverse);
      }
    }

    return inverse;
  }

  /**
   * The public `ctx.effect` primitive.
   *
   * Wraps `execute` with:
   *
   * - an `armed` guard: flipping it stops any in-flight iterator at its next
   *   boundary and makes later calls to the returned disposer no-ops;
   * - forward registration: after the composite inverse has run, this
   *   disposer is prepended to `ctx.dispose`, so that an enclosing context's
   *   teardown also recovers this effect.
   */
  static effect(ctx: Context, callback: EffectCallback): Dispose {
    let armed = true;

    const task = EffectEngine.execute(callback, () => armed);

    const dispose: Dispose = async () => {
      if (!armed) {
        return;
      }

      armed = false;

      const recover = await task;
      await recover();

      ctx.dispose = EffectEngine.compose(dispose, ctx.dispose);
    };

    return dispose;
  }
}

/**
 * Normalizes the value returned by an `EffectCallback` into an async iterator
 * of inverses.
 *
 * - An object with a `next` method is used directly.
 * - A plain function is treated as a single, already-materialized inverse.
 * - `undefined` / `null` is treated as an effect with no inverses.
 */
function toAsyncIterator(
  result: EffectIterator | (() => Inverse | void),
): EffectIterator {
  if (isIteratorLike(result)) {
    return result;
  }

  if (typeof result === 'function') {
    const inverse = result as Dispose;
    return singleInverseIterator(inverse);
  }

  return emptyIterator();
}

/**
 * True when the value is an iterator-like object (async or sync).
 */
function isIteratorLike(value: unknown): value is EffectIterator {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { next?: unknown }).next === 'function'
  );
}

/**
 * Wraps a single inverse as a one-element async generator.
 */
async function* singleInverseIterator(inverse: Dispose): EffectIterator {
  yield inverse;
}

/**
 * An async generator that produces no inverses.
 */
async function* emptyIterator(): EffectIterator {
  /* intentionally empty */
}
