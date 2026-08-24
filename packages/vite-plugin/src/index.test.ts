import { describe, expect, it } from 'vitest'
import { transformNexisSource } from './index'

describe('Nexis Vite transform', () => {
  it('extracts a dollar event boundary into a hashed lazy chunk', () => {
    const result = transformNexisSource(
      "const handler = (event) => event.currentTarget.textContent = 'ok'\nconst view = <button onClick$={handler}>Click</button>",
      '/app/src/routes/index.tsx',
    )
    expect(result.code).toContain('data-nx-on-click="chunk_')
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0]?.fileName).toMatch(/^chunk_[a-f0-9]{12}\.js$/)
    expect(result.chunks[0]?.source).toContain('handler_')
  })

  it('rejects server imports in client modules', () => {
    expect(() =>
      transformNexisSource(
        "import session from '../server/session'\nexport const view = <div />",
        '/app/src/client/view.tsx',
      ),
    ).toThrow(/NEXIS_SERVER_IMPORT_IN_CLIENT/)
  })

  it('rejects secret-like environment access in client modules', () => {
    expect(() =>
      transformNexisSource(
        'export const key = import.meta.env.PUBLIC_API_SECRET',
        '/app/src/client/config.ts',
      ),
    ).toThrow(/NEXIS_SECRET_EXPOSURE/)
  })

  it('extracts static JSX styles into CSS output', () => {
    const result = transformNexisSource(
      "const view = <div style={{ color: 'red', marginTop: 4 }} />",
      '/app/src/routes/index.tsx',
    )
    expect(result.css).toHaveLength(1)
    expect(result.css[0]).toContain('color:red;')
    expect(result.css[0]).toContain('margin-top:4;')
  })
})
