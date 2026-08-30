export type TelemetryEventName =
  | 'navigation'
  | 'route-transition-error'
  | 'chunk-load-failure'
  | 'resumability-activation'
  | 'web-vital'

export interface TelemetryEvent {
  readonly name: TelemetryEventName
  readonly timestamp: number
  readonly route: string
  readonly value?: number
  readonly detail?: string
}

export interface TelemetryOptions {
  readonly enabled?: boolean
  readonly endpoint: string
  readonly route?: string
}

export type WebVitalName = 'LCP' | 'CLS' | 'INP'

export interface WebVitalMetric {
  readonly name: WebVitalName
  readonly value: number
}

export interface WebVitalsObserverOptions {
  readonly onMetric: (metric: WebVitalMetric) => void
  readonly PerformanceObserver?: typeof PerformanceObserver
}

type VitalEntryList = { readonly getEntries: () => PerformanceEntry[] }
type VitalObserver = {
  new (callback: (list: VitalEntryList) => void): {
    observe: (options: PerformanceObserverInit & { readonly durationThreshold?: number }) => void
    disconnect: () => void
  }
}

export interface TelemetryClient {
  readonly enabled: boolean
  readonly send: (
    event: Omit<TelemetryEvent, 'timestamp' | 'route'> & { readonly route?: string },
  ) => boolean
  readonly navigation: (ttfb: number) => boolean
  readonly routeError: (detail: string) => boolean
  readonly chunkFailure: (detail: string) => boolean
  readonly resumability: (duration: number) => boolean
  readonly vital: (name: WebVitalName, value: number) => boolean
  readonly observeWebVitals: (
    options: Omit<WebVitalsObserverOptions, 'onMetric'> & {
      readonly onMetric?: (metric: WebVitalMetric) => void
    },
  ) => () => void
}

function assertEndpoint(endpoint: string): void {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//'))
    throw new TypeError('Nexil telemetry endpoint must be a local absolute path.')
}

export function createTelemetry(options: TelemetryOptions): TelemetryClient {
  assertEndpoint(options.endpoint)
  const enabled = options.enabled === true
  const route = options.route ?? (typeof location === 'undefined' ? '/' : location.pathname)
  const send = (
    event: Omit<TelemetryEvent, 'timestamp' | 'route'> & { readonly route?: string },
  ): boolean => {
    if (!enabled || typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function')
      return false
    const payload: TelemetryEvent = {
      ...event,
      timestamp: Date.now(),
      route: event.route ?? route,
    }
    return navigator.sendBeacon(options.endpoint, JSON.stringify(payload))
  }
  return {
    enabled,
    send,
    navigation: (ttfb) => send({ name: 'navigation', value: ttfb }),
    routeError: (detail) => send({ name: 'route-transition-error', detail }),
    chunkFailure: (detail) => send({ name: 'chunk-load-failure', detail }),
    resumability: (duration) => send({ name: 'resumability-activation', value: duration }),
    vital: (name, value) => send({ name: 'web-vital', value, detail: name }),
    observeWebVitals: (observerOptions) => {
      if (!enabled) return () => undefined
      return observeWebVitals({
        ...observerOptions,
        onMetric:
          observerOptions.onMetric ??
          ((metric) => send({ name: 'web-vital', value: metric.value, detail: metric.name })),
      })
    },
  }
}

export function observeWebVitals(options: WebVitalsObserverOptions): () => void {
  const Observer = (options.PerformanceObserver ??
    (typeof PerformanceObserver === 'undefined' ? undefined : PerformanceObserver)) as
    VitalObserver | undefined

  if (!Observer) return () => undefined
  const observers: Array<{ disconnect: () => void }> = []
  let cls = 0
  const add = (
    type: string,
    callback: (entries: VitalEntryList) => void,
    extra: PerformanceObserverInit & { readonly durationThreshold?: number } = {},
  ) => {
    try {
      const observer = new Observer((list) => callback(list))
      observer.observe({ type, buffered: true, ...extra })
      observers.push(observer)
    } catch {
      // Unsupported entry types are ignored, preserving optional telemetry.
    }
  }
  add('largest-contentful-paint', (list) => {
    const last = list.getEntries().at(-1)
    if (last) options.onMetric({ name: 'LCP', value: last.startTime })
  })
  add('layout-shift', (list) => {
    for (const entry of list.getEntries() as (PerformanceEntry & {
      value?: number
      hadRecentInput?: boolean
    })[]) {
      if (!entry.hadRecentInput) cls += entry.value ?? 0
    }
    options.onMetric({ name: 'CLS', value: cls })
  })
  add(
    'event',
    (list) => {
      let inp = 0
      for (const entry of list.getEntries() as (PerformanceEntry & {
        processingStart?: number
      })[]) {
        const processingStart = entry.processingStart ?? entry.startTime
        inp = Math.max(inp, processingStart + entry.duration - entry.startTime)
      }
      if (inp > 0) options.onMetric({ name: 'INP', value: inp })
    },
    { durationThreshold: 16 },
  )
  return () => observers.forEach((observer) => observer.disconnect())
}

export function renderTelemetryScript(options: TelemetryOptions): string {
  if (options.enabled !== true) return ''
  assertEndpoint(options.endpoint)
  const endpoint = JSON.stringify(options.endpoint)
  return `<script>addEventListener('nexil:resumed',e=>navigator.sendBeacon(${endpoint},JSON.stringify({name:'resumability-activation',timestamp:Date.now(),route:location.pathname,value:e.detail?.duration??0})));(()=>{let c=0;try{new PerformanceObserver(l=>{let e=l.getEntries().at(-1);if(e)navigator.sendBeacon(${endpoint},JSON.stringify({name:'web-vital',detail:'LCP',timestamp:Date.now(),route:location.pathname,value:e.startTime}))}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)c+=e.value;navigator.sendBeacon(${endpoint},JSON.stringify({name:'web-vital',detail:'CLS',timestamp:Date.now(),route:location.pathname,value:c}))}).observe({type:'layout-shift',buffered:true})}catch{}})()</script>`
}

export const telemetryEventSchema = {
  name: [
    'navigation',
    'route-transition-error',
    'chunk-load-failure',
    'resumability-activation',
    'web-vital',
  ],
  timestamp: 'unix-ms',
  route: 'pathname',
  value: 'optional-number',
  detail: 'optional-string',
} as const
