export type ModuleBoundary = 'server' | 'client' | 'shared'

export interface BoundaryDiagnostic {
  readonly code:
    'NEXIS_SERVER_IMPORT_IN_CLIENT' | 'NEXIS_CLIENT_IMPORT_IN_SERVER' | 'NEXIS_SECRET_EXPOSURE'
  readonly importer: string
  readonly imported?: string
  readonly message: string
}

export function classifyModule(moduleId: string): ModuleBoundary {
  const normalized = moduleId.replace(/\\/g, '/')
  if (/(^|\/)server(\/|$)/.test(normalized)) return 'server'
  if (/(^|\/)client(\/|$)/.test(normalized)) return 'client'
  return 'shared'
}

export function validateImport(importer: string, imported: string): BoundaryDiagnostic | undefined {
  const importerBoundary = classifyModule(importer)
  const importedBoundary = classifyModule(imported)
  if (importerBoundary === 'client' && importedBoundary === 'server') {
    return {
      code: 'NEXIS_SERVER_IMPORT_IN_CLIENT',
      importer,
      imported,
      message: `Client module ${importer} cannot import server-only module ${imported}.`,
    }
  }
  if (importerBoundary === 'server' && importedBoundary === 'client') {
    return {
      code: 'NEXIS_CLIENT_IMPORT_IN_SERVER',
      importer,
      imported,
      message: `Server module ${importer} cannot import client-only module ${imported}.`,
    }
  }
  return undefined
}

export function findSecretExposure(
  moduleId: string,
  source: string,
): BoundaryDiagnostic | undefined {
  if (classifyModule(moduleId) !== 'client') return undefined
  const secretPattern =
    /(?:process\.env|import\.meta\.env)(?:\s*\.\s*[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|KEY)\b|\s*\[\s*["'`][A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|KEY)["'`]\s*\]|\s*\[\s*[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|KEY)\s*\])/i
  const destructuredSecretPattern =
    /(?:const|let|var)\s*\{[^}]*\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|KEY)\b[^}]*\}\s*=\s*(?:process\.env|import\.meta\.env)/i
  if (!secretPattern.test(source) && !destructuredSecretPattern.test(source)) return undefined
  return {
    code: 'NEXIS_SECRET_EXPOSURE',
    importer: moduleId,
    message: `Client module ${moduleId} references a secret-like environment variable.`,
  }
}
