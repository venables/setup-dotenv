export interface SyncOptions {
  envPath: string
  templatePath: string
  dryRun?: boolean
  overwriteEmptyValues?: boolean
  skipEmptySourceValues?: boolean
  resolveOp?: boolean
  refreshOp?: boolean
}

export interface SetupResult {
  bootstrapped: boolean
  missingCount: number
  missingKeys: string[]
}

export function getValueForKey(
  key: string,
  templateParsed: Record<string, string>
): string {
  return templateParsed[key] || ""
}
