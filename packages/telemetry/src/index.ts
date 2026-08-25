export type TelemetryEventName =
  'navigation' | 'route-transition-error' | 'chunk-load-failure' | 'resumability-activation'

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

export interface TelemetryClient {
  readonly enabled: boolean
  readonly send: (
    event: Omit<TelemetryEvent, 'timestamp' | 'route'> & { readonly route?: string },
  ) => boolean
  readonly navigation: (ttfb: number) => boolean
  readonly routeError: (detail: string) => boolean
  readonly chunkFailure: (detail: string) => boolean
  readonly resumability: (duration: number) => boolean
}

function assertEndpoint(endpoint: string): void {
  if (!endpoint.startsWith('/') || endpoint.startsWith('//'))
    throw new TypeError('Nexis telemetry endpoint must be a local absolute path.')
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
  }
}

export function renderTelemetryScript(options: TelemetryOptions): string {
  if (options.enabled !== true) return ''
  assertEndpoint(options.endpoint)
  const endpoint = JSON.stringify(options.endpoint)
  return `<script>addEventListener('nexis:resumed',e=>navigator.sendBeacon(${endpoint},JSON.stringify({name:'resumability-activation',timestamp:Date.now(),route:location.pathname,value:e.detail?.duration??0})))</script>`
}

export const telemetryEventSchema = {
  name: ['navigation', 'route-transition-error', 'chunk-load-failure', 'resumability-activation'],
  timestamp: 'unix-ms',
  route: 'pathname',
  value: 'optional-number',
  detail: 'optional-string',
} as const
