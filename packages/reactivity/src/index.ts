type Listener = () => void
export type Unsubscribe = () => void

type DependencyCollector = {
  readonly notify: Listener
  readonly cleanups: Set<Unsubscribe>
}

export interface SignalOptions<T> {
  /** Return true when the previous and next values should be treated as equal. */
  readonly equals?: (previous: T, next: T) => boolean
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

export interface Resource<T> extends ReadableSignal<T | undefined> {
  readonly loading: ReadableSignal<boolean>
  readonly error: ReadableSignal<Error | null>
  refetch(): Promise<void>
}

let activeCollector: DependencyCollector | undefined
let activeScope: Set<() => void> | undefined
let batchDepth = 0
const pendingNotifications = new Set<Listener>()
let flushing = false
const evaluatingComputeds = new Set<() => unknown>()

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

export function state<T>(initial: T, options: SignalOptions<T> = {}): Signal<T> {
  let value = initial
  let disposed = false
  const listeners = new Set<Listener>()
  const equals = options.equals ?? Object.is

  const read = (() => {
    if (disposed) throw new Error('Nexis signal has been disposed.')
    track(read)
    return value
  }) as Signal<T>

  read.get = () => {
    if (disposed) throw new Error('Nexis signal has been disposed.')
    track(read)
    return value
  }
  Object.defineProperty(read, 'value', {
    enumerable: true,
    get: () => read.get(),
  })
  read.setValue = (next) => {
    if (disposed || equals(value, next)) return
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
export function useState<T>(
  initial: T,
  options?: SignalOptions<T>,
): readonly [Signal<T>, Signal<T>['set']] {
  const value = state(initial, options)
  return [value, value.set] as const
}

export function computed<T>(derive: () => T, options: SignalOptions<T> = {}): ReadableSignal<T> {
  const result = state<T | undefined>(undefined)
  let initialized = false
  let current!: T
  let disposed = false
  let evaluating = false
  let scheduled = false
  let cleanups = new Set<Unsubscribe>()
  const equals = options.equals ?? Object.is

  const recompute = () => {
    if (disposed) return
    scheduled = false
    const nextCleanups = new Set<Unsubscribe>()
    const previousCollector = activeCollector
    activeCollector = { notify: () => schedule(), cleanups: nextCleanups }
    try {
      if (evaluatingComputeds.has(derive))
        throw new Error(
          'Nexis computed dependency cycle detected while evaluating a derived signal.',
        )
      evaluatingComputeds.add(derive)
      evaluating = true
      const next = derive()
      evaluatingComputeds.delete(derive)
      for (const cleanup of cleanups) cleanup()
      cleanups = nextCleanups
      if (!initialized || !equals(current, next)) {
        initialized = true
        current = next
        result.setValue(next)
      }
    } finally {
      evaluating = false
      evaluatingComputeds.delete(derive)
      activeCollector = previousCollector
    }
  }

  const schedule = () => {
    if (disposed || scheduled) return
    scheduled = true
    pendingNotifications.add(recompute)
    flushNotifications()
  }

  recompute()

  const read = (() => {
    if (evaluating)
      throw new Error('Nexis computed dependency cycle detected while reading a derived signal.')
    return result.get() as T
  }) as ReadableSignal<T>
  read.get = () => read()
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

/**
 * Reactive async data with explicit loading/error state and a race-safe refetch.
 * The loader is invoked immediately and again whenever refetch is called.
 */
export function resource<T>(loader: () => Promise<T> | T): Resource<T> {
  const value = state<T | undefined>(undefined)
  const loading = state(false)
  const error = state<Error | null>(null)
  let disposed = false
  let requestId = 0

  const refetch = async (): Promise<void> => {
    if (disposed) return
    const currentRequest = ++requestId
    loading.set(true)
    error.set(null)
    try {
      const next = await loader()
      if (disposed || currentRequest !== requestId) return
      value.set(next)
    } catch (cause) {
      if (disposed || currentRequest !== requestId) return
      error.set(cause instanceof Error ? cause : new Error(String(cause)))
    } finally {
      if (!disposed && currentRequest === requestId) loading.set(false)
    }
  }

  const read = (() => value()) as Resource<T>
  read.get = () => value()
  Object.defineProperty(read, 'value', { enumerable: true, get: () => read.get() })
  read.subscribe = value.subscribe
  read.dispose = () => {
    if (disposed) return
    disposed = true
    requestId += 1
    value.dispose()
    loading.dispose()
    error.dispose()
  }
  Object.defineProperties(read, {
    loading: { enumerable: true, value: loading },
    error: { enumerable: true, value: error },
    refetch: { enumerable: true, value: refetch },
  })
  registerCleanup(read.dispose)
  void refetch()
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
