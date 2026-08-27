import { describe, expect, it } from 'vitest'
import { assertBudget, checkBudget } from './budget'

describe('Nexis performance budgets', () => {
  it('passes a non-interactive route with zero client JavaScript', () => {
    expect(
      checkBudget({
        route: '/',
        interactive: false,
        clientJsGzipBytes: 0,
        bootstrapGzipBytes: 0,
      }).passed,
    ).toBe(true)
  })

  it('fails static routes that ship client JavaScript', () => {
    expect(() =>
      assertBudget({
        route: '/about',
        interactive: false,
        clientJsGzipBytes: 1,
        bootstrapGzipBytes: 0,
      }),
    ).toThrow(/limit is 0/)
  })

  it('fails interactive routes above 15KB gzipped', () => {
    expect(() =>
      assertBudget({
        route: '/counter',
        interactive: true,
        clientJsGzipBytes: 15 * 1024 + 1,
        bootstrapGzipBytes: 100,
      }),
    ).toThrow(/limit is 15360/)
  })

  it('fails a Link route whose navigation runtime exceeds its 6KB gzip budget', () => {
    expect(() =>
      assertBudget({
        route: '/docs',
        interactive: false,
        clientJsGzipBytes: 0,
        bootstrapGzipBytes: 0,
        navigationGzipBytes: 6 * 1024 + 1,
      }),
    ).toThrow(/Navigation runtime.*limit is 6144/)
  })

  it('fails oversized bootstrap output and accepts a documented override', () => {
    expect(
      checkBudget({
        route: '/counter',
        interactive: true,
        clientJsGzipBytes: 15 * 1024 + 1,
        bootstrapGzipBytes: 1025,
        overrideReason: 'Temporary compatibility fixture; tracked in issue #1.',
      }).passed,
    ).toBe(true)
  })
})
