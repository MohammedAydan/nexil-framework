import { describe, expect, it } from 'vitest'
import { classifyModule, findSecretExposure, validateImport } from './boundaries'

describe('module boundaries', () => {
  it('classifies server, client, and shared modules', () => {
    expect(classifyModule('src/server/db.ts')).toBe('server')
    expect(classifyModule('src/client/menu.ts')).toBe('client')
    expect(classifyModule('src/shared/types.ts')).toBe('shared')
  })

  it('rejects server imports in client code and client imports in server code', () => {
    expect(validateImport('src/client/menu.ts', 'src/server/session.ts')?.code).toBe(
      'NEXIS_SERVER_IMPORT_IN_CLIENT',
    )
    expect(validateImport('src/server/page.ts', 'src/client/widget.ts')?.code).toBe(
      'NEXIS_CLIENT_IMPORT_IN_SERVER',
    )
    expect(validateImport('src/client/menu.ts', 'src/shared/types.ts')).toBeUndefined()
  })

  it('detects secret-like environment access in client modules', () => {
    expect(findSecretExposure('src/client/config.ts', 'const x = process.env.API_SECRET')?.code).toBe(
      'NEXIS_SECRET_EXPOSURE',
    )
    expect(findSecretExposure('src/server/config.ts', 'const x = process.env.API_SECRET')).toBeUndefined()
  })
})
