import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateOgImage, renderOgImageSvg } from './index'

describe('OG image generation', () => {
  it('renders safe deterministic SVG text', () => {
    const svg = renderOgImageSvg({ title: '<Nexil>', description: 'HTML & resumability' })
    expect(svg).toContain('&lt;Nexil&gt;')
    expect(svg).toContain('HTML &amp; resumability')
    expect(svg).not.toContain('<Nexil>')
  })

  it('writes a PNG and returns a cache hit on the second generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexil-og-'))
    try {
      const options = { title: 'Nexil', description: 'A fast framework' }
      const first = await generateOgImage(options, root)
      const second = await generateOgImage(options, root)
      expect(first.cacheHit).toBe(false)
      expect(second.cacheHit).toBe(true)
      expect(first.fileName).toMatch(/^[a-f0-9]{24}\.png$/)
      expect((await readFile(join(root, first.fileName))).byteLength).toBeGreaterThan(100)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
