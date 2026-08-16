/**
 * Events, mapped onto the paradigm: an event is a coeffect key whose value is
 * a listener registry (the API-sketch note in Spec 5). An emitter provides the
 * key; listeners inject it. A subscription is an ordinary tracked effect, so
 * it is withdrawn automatically when the subscribing component unloads —
 * temporal composability with no hand-written unsubscribe path.
 */
import { type Context } from './context.ts'
import { type Disposer } from './effects.ts'
import { type Key } from './context.ts'

export interface EventRegistry {
  readonly listeners: unknown[]
}

export type Listener = (...args: unknown[]) => unknown

/** Subscribe one listener to a provided event — an effect (withdrawn on unload). */
export const subscribe = (ctx: Context, eventKey: Key, listener: Listener): Disposer => {
  const registry = ctx.get(eventKey)
  if (registry === undefined || typeof registry !== 'object' || !Array.isArray((registry as EventRegistry).listeners)) {
    throw new Error(`no event provider at ${String(eventKey)}`)
  }
  const listeners = (registry as EventRegistry).listeners
  return ctx.effect(() => {
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index >= 0) listeners.splice(index, 1)
    }
  })
}

/** Emit one event: every registered listener observes it, in registration order. */
export const emit = (registry: unknown, ...args: unknown[]): void => {
  for (const listener of [...(registry as EventRegistry).listeners] as Listener[]) {
    listener(...args)
  }
}

/** The event registry value an event-provider component installs at its key. */
export const eventRegistry = (): EventRegistry => ({ listeners: [] })
