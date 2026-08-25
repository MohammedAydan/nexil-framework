export type Unsubscribe = () => void

type Listener = () => void

type DependencyCollector = {
  readonly notify: Listener
  readonly cleanups: Set<Unsubscribe>
}

export interface ReadableSignal<T> {
  (): T
  get(): T
  subscribe(listener: Listener): Unsubscribe
}

export interface Signal<T> extends ReadableSignal<T> {
  set(next: T | ((previous: T) => T)): void
}

let activeCollector: DependencyCollector | undefined

function track<T>(signal: ReadableSignal<T>): void {
  if (!activeCollector) return
  activeCollector.cleanups.add(signal.subscribe(activeCollector.notify))
}

export function state<T>(initial: T): Signal<T> {
  let value = initial
  const listeners = new Set<Listener>()

  const read = (() => {
    track(read)
    return value
  }) as Signal<T>

  read.get = () => {
    track(read)
    return value
  }
  read.set = (next) => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next
    if (Object.is(value, resolved)) return
    value = resolved
    for (const listener of [...listeners]) listener()
  }
  read.subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return read
}

/** Compact state form for components that prefer a value/setter tuple. */
export function useState<T>(initial: T): readonly [Signal<T>, Signal<T>['set']] {
  const value = state(initial)
  return [value, value.set] as const
}

export function computed<T>(derive: () => T): ReadableSignal<T> {
  const result = state<T | undefined>(undefined)
  let initialized = false
  let current!: T
  let cleanups = new Set<Unsubscribe>()

  const recompute = () => {
    for (const cleanup of cleanups) cleanup()
    cleanups = new Set()

    const previousCollector = activeCollector
    activeCollector = { notify: recompute, cleanups }
    try {
      const next = derive()
      if (!initialized || !Object.is(current, next)) {
        initialized = true
        current = next
        result.set(next)
      }
    } finally {
      activeCollector = previousCollector
    }
  }

  recompute()

  const read = (() => result.get() as T) as ReadableSignal<T>
  read.get = () => result.get() as T
  read.subscribe = result.subscribe
  return read
}

export function batch(run: () => void): void {
  run()
}
