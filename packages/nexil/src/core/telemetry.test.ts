import { describe, expect, it, vi } from 'vitest'
import { createTelemetry, renderTelemetryScript, telemetryEventSchema } from './index'

describe('telemetry', () => {
  it('ships zero script bytes and no beacon when disabled', () => {
    const beacon = vi.fn<(endpoint: string, body: string) => boolean>(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    const client = createTelemetry({ endpoint: '/__nexil/telemetry' })
    expect(client.enabled).toBe(false)
    expect(client.navigation(12)).toBe(false)
    expect(renderTelemetryScript({ endpoint: '/__nexil/telemetry' })).toBe('')
    expect(beacon).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sends opt-in events through sendBeacon with the stable schema', () => {
    const beacon = vi.fn<(endpoint: string, body: string) => boolean>(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    vi.stubGlobal('location', { pathname: '/labs' })
    const client = createTelemetry({ enabled: true, endpoint: '/__nexil/telemetry' })
    expect(client.resumability(7)).toBe(true)
    expect(beacon).toHaveBeenCalledTimes(1)
    const [endpoint, body] = beacon.mock.calls[0]! as [string, string]
    expect(endpoint).toBe('/__nexil/telemetry')
    expect(JSON.parse(body)).toMatchObject({
      name: 'resumability-activation',
      route: '/labs',
      value: 7,
    })
    expect(renderTelemetryScript({ enabled: true, endpoint: '/__nexil/telemetry' })).toContain(
      'nexil:resumed',
    )
    expect(telemetryEventSchema.name).toContain('chunk-load-failure')
    expect(client.vital('LCP', 123)).toBe(true)
    vi.unstubAllGlobals()
  })

  it('observes supported metrics and disconnects cleanly', () => {
    const callbacks: Array<(list: { getEntries: () => PerformanceEntry[] }) => void> = []
    const disconnected: boolean[] = []
    class FakeObserver {
      constructor(callback: (list: { getEntries: () => PerformanceEntry[] }) => void) {
        callbacks.push(callback)
      }
      observe() {}
      disconnect() {
        disconnected.push(true)
      }
    }
    const metrics: string[] = []
    const stop = createTelemetry({ enabled: true, endpoint: '/telemetry' }).observeWebVitals({
      PerformanceObserver: FakeObserver as never,
      onMetric: (metric) => metrics.push(metric.name),
    })
    callbacks[0]?.({ getEntries: () => [{ startTime: 42 } as PerformanceEntry] })
    callbacks[1]?.({
      getEntries: () => [{ duration: 1, startTime: 1, value: 0.1 } as unknown as PerformanceEntry],
    })
    stop()
    expect(metrics).toContain('LCP')
    expect(metrics).toContain('CLS')
    expect(disconnected.length).toBeGreaterThan(0)
  })

  it('keeps the observer inert when telemetry is disabled', () => {
    const client = createTelemetry({ endpoint: '/telemetry' })
    let called = false
    const stop = client.observeWebVitals({
      onMetric: () => {
        called = true
      },
    })
    stop()
    expect(called).toBe(false)
  })
})
