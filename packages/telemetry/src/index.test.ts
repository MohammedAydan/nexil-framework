import { describe, expect, it, vi } from 'vitest'
import { createTelemetry, renderTelemetryScript, telemetryEventSchema } from './index'

describe('telemetry', () => {
  it('ships zero script bytes and no beacon when disabled', () => {
    const beacon = vi.fn<(endpoint: string, body: string) => boolean>(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    const client = createTelemetry({ endpoint: '/__nexis/telemetry' })
    expect(client.enabled).toBe(false)
    expect(client.navigation(12)).toBe(false)
    expect(renderTelemetryScript({ endpoint: '/__nexis/telemetry' })).toBe('')
    expect(beacon).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('sends opt-in events through sendBeacon with the stable schema', () => {
    const beacon = vi.fn<(endpoint: string, body: string) => boolean>(() => true)
    vi.stubGlobal('navigator', { sendBeacon: beacon })
    vi.stubGlobal('location', { pathname: '/labs' })
    const client = createTelemetry({ enabled: true, endpoint: '/__nexis/telemetry' })
    expect(client.resumability(7)).toBe(true)
    expect(beacon).toHaveBeenCalledTimes(1)
    const [endpoint, body] = beacon.mock.calls[0]! as [string, string]
    expect(endpoint).toBe('/__nexis/telemetry')
    expect(JSON.parse(body)).toMatchObject({
      name: 'resumability-activation',
      route: '/labs',
      value: 7,
    })
    expect(renderTelemetryScript({ enabled: true, endpoint: '/__nexis/telemetry' })).toContain(
      'nexis:resumed',
    )
    expect(telemetryEventSchema.name).toContain('chunk-load-failure')
    vi.unstubAllGlobals()
  })
})
