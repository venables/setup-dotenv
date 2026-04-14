import { randomBytes } from "node:crypto"

export interface SyncOptions {
  envPath: string
  templatePath: string
  variables?: string[]
  dryRun?: boolean
  overwriteEmptyValues?: boolean
  skipEmptySourceValues?: boolean
  resolveOp?: boolean
}

export interface GenerateOptions {
  envPath: string
  variables: string[]
  length?: number
  encoding?: SecretEncoding
  dryRun?: boolean
  force?: boolean
}

export interface SetupResult {
  bootstrapped: boolean
  missingCount: number
  missingKeys: string[]
}

export type SecretEncoding = "base64url" | "hex"

export function generateRandomValue(
  length: number = 32,
  encoding: SecretEncoding = "base64url"
): string {
  const bytes = randomBytes(length)
  if (encoding === "hex") {
    return bytes.toString("hex")
  }
  return bytes.toString("base64url")
}

export function getValueForKey(
  key: string,
  templateParsed: Record<string, string>
): string {
  return templateParsed[key] || ""
}
