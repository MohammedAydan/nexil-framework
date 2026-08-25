type Listener = () => void
export type Unsubscribe = () => void

type DependencyCollector = {
  readonly notify: Listener
  readonly cleanups: Set<Unsubscribe>
}

export interface ReadableSignal<T> {
  (): T
  get(): T
  readonly value: T
  subscribe(listener: Listener): Unsubscribe
  dispose(): void
}

export interface Signal<T> extends ReadableSignal<T> {
  set(next: T | ((previous: T) => T)): void
  setValue(next: T): void
}

let activeCollector: DependencyCollector | undefined
let activeScope: Set<() => void> | undefined
let batchDepth = 0
const pendingNotifications = new Set<Listener>()
let flushing = false

function notify(listener: Listener): void {
  if (batchDepth > 0 || flushing) {
    pendingNotifications.add(listener)
    return
  }
  listener()
}

function flushNotifications(): void {
  if (batchDepth > 0 || flushing) return
  flushing = true
  try {
    while (pendingNotifications.size > 0) {
      const pending = [...pendingNotifications]
      pendingNotifications.clear()
      for (const listener of pending) listener()
    }
  } finally {
    flushing = false
  }
}

function track<T>(signal: ReadableSignal<T>): void {
  if (!activeCollector) return
  activeCollector.cleanups.add(signal.subscribe(activeCollector.notify))
}

function registerCleanup(cleanup: () => void): void {
  activeScope?.add(cleanup)
}

export function state<T>(initial: T): Signal<T> {
  let value = initial
  let disposed = false
  const listeners = new Set<Listener>()

  const read = (() => {
    track(read)
    return value
  }) as Signal<T>

  read.get = () => {
    track(read)
    return value
  }
  Object.defineProperty(read, 'value', {
    enumerable: true,
    get: () => read.get(),
  })
  read.setValue = (next) => {
    if (disposed || Object.is(value, next)) return
    value = next
    for (const listener of [...listeners]) notify(listener)
    flushNotifications()
  }
  read.set = (next) => {
    const resolved = typeof next === 'function' ? (next as (previous: T) => T)(value) : next
    read.setValue(resolved)
  }
  read.subscribe = (listener) => {
    if (disposed) return () => undefined
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  read.dispose = () => {
    disposed = true
    listeners.clear()
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
  let disposed = false
  let scheduled = false
  let cleanups = new Set<Unsubscribe>()

  const recompute = () => {
    if (disposed) return
    scheduled = false
    const nextCleanups = new Set<Unsubscribe>()
    const previousCollector = activeCollector
    activeCollector = { notify: () => schedule(), cleanups: nextCleanups }
    try {
      const next = derive()
      for (const cleanup of cleanups) cleanup()
      cleanups = nextCleanups
      if (!initialized || !Object.is(current, next)) {
        initialized = true
        current = next
        result.setValue(next)
      }
    } finally {
      activeCollector = previousCollector
      if (activeCollector) {
        for (const cleanup of nextCleanups) activeCollector.cleanups.add(cleanup)
      }
    }
  }

  const schedule = () => {
    if (disposed || scheduled) return
    scheduled = true
    pendingNotifications.add(recompute)
    flushNotifications()
  }

  recompute()

  const read = (() => result.get() as T) as ReadableSignal<T>
  read.get = () => result.get() as T
  Object.defineProperty(read, 'value', {
    enumerable: true,
    get: () => read.get(),
  })
  read.subscribe = result.subscribe
  read.dispose = () => {
    if (disposed) return
    disposed = true
    for (const cleanup of cleanups) cleanup()
    cleanups.clear()
    result.dispose()
  }
  registerCleanup(read.dispose)
  return read
}

export function batch(run: () => void): void {
  batchDepth += 1
  try {
    run()
  } finally {
    batchDepth -= 1
    flushNotifications()
  }
}

export function untrack<T>(read: () => T): T {
  const previousCollector = activeCollector
  activeCollector = undefined
  try {
    return read()
  } finally {
    activeCollector = previousCollector
  }
}

export function effect(run: () => void): () => void {
  let disposed = false
  let cleanups = new Set<Unsubscribe>()
  const execute = () => {
    if (disposed) return
    for (const cleanup of cleanups) cleanup()
    cleanups = new Set()
    const previousCollector = activeCollector
    activeCollector = { notify: execute, cleanups }
    try {
      run()
    } finally {
      activeCollector = previousCollector
    }
  }
  execute()
  const dispose = () => {
    disposed = true
    for (const cleanup of cleanups) cleanup()
    cleanups.clear()
  }
  registerCleanup(dispose)
  return dispose
}

export function watch<T>(
  read: () => T,
  listener: (value: T, previous: T | undefined) => void,
): () => void {
  let previous: T | undefined
  let initialized = false
  return effect(() => {
    const value = read()
    if (initialized && !Object.is(previous, value)) listener(value, previous)
    previous = value
    initialized = true
  })
}

export function createRoot<T>(run: (dispose: () => void) => T): T {
  const parent = activeScope
  const cleanups = new Set<() => void>()
  activeScope = cleanups
  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const cleanup of [...cleanups]) cleanup()
    cleanups.clear()
  }
  try {
    return run(dispose)
  } finally {
    activeScope = parent
  }
}

export function onCleanup(cleanup: () => void): void {
  registerCleanup(cleanup)
}
