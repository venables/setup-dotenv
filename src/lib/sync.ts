import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { parse } from "dotenv"

import { getValueForKey, type SetupResult, type SyncOptions } from "./common"

interface DetailedSetupResult extends SetupResult {
  missingKeyValues?: Record<string, string>
}

function getKeysToProcess(
  templateParsed: Record<string, string>,
  variables?: string[],
  skipEmptySourceValues?: boolean
): string[] {
  const allTemplateKeys = Object.keys(templateParsed)
  let keysToInclude =
    variables && variables.length > 0
      ? variables.filter((key) => allTemplateKeys.includes(key))
      : allTemplateKeys

  // Filter out keys with empty values if skipEmptySourceValues is enabled
  if (skipEmptySourceValues) {
    keysToInclude = keysToInclude.filter(
      (key) => templateParsed[key] && templateParsed[key].trim() !== ""
    )
  }

  return keysToInclude
}

function bootstrapEnvFile(
  envPath: string,
  templateContent: string,
  templateParsed: Record<string, string>,
  keysToBootstrap: string[],
  variables?: string[],
  dryRun?: boolean,
  skipEmptySourceValues?: boolean
): void {
  if (dryRun) return

  if ((variables && variables.length > 0) || skipEmptySourceValues) {
    const filteredLines = keysToBootstrap.map(
      (key) => `${key}="${getValueForKey(key, templateParsed)}"`
    )
    writeFileSync(envPath, `${filteredLines.join("\n")}\n`)
    return
  }

  // Copy template content as-is without modifying existing format
  writeFileSync(envPath, templateContent)
}

function appendMissingVariables(
  envPath: string,
  missingKeys: string[],
  defaults: Record<string, string>,
  dryRun?: boolean
): void {
  if (dryRun || missingKeys.length === 0) return

  const lines = missingKeys.map((k) => `${k}="${getValueForKey(k, defaults)}"`)
  writeFileSync(envPath, `\n${lines.join("\n")}\n`, {
    flag: "a"
  })
}

export function syncDotenv(options: SyncOptions): DetailedSetupResult {
  const {
    envPath,
    templatePath,
    variables,
    dryRun,
    overwriteEmptyValues = true,
    skipEmptySourceValues = false
  } = options

  const templateContent = readFileSync(templatePath, "utf8")
  const templateParsed = parse(templateContent)

  // Handle bootstrap case (no .env file exists)
  if (!existsSync(envPath)) {
    const keysToBootstrap = getKeysToProcess(
      templateParsed,
      variables,
      skipEmptySourceValues
    )

    bootstrapEnvFile(
      envPath,
      templateContent,
      templateParsed,
      keysToBootstrap,
      variables,
      dryRun,
      skipEmptySourceValues
    )

    const missingKeyValues = keysToBootstrap.reduce(
      (acc, key) => {
        acc[key] = getValueForKey(key, templateParsed)
        return acc
      },
      {} as Record<string, string>
    )

    return {
      bootstrapped: true,
      missingCount: keysToBootstrap.length,
      missingKeys: keysToBootstrap,
      missingKeyValues
    }
  }

  // Handle sync case (.env file exists)
  const current = parse(readFileSync(envPath, "utf8"))
  const availableKeys = getKeysToProcess(
    templateParsed,
    variables,
    skipEmptySourceValues
  )

  // Filter keys to sync based on missing keys and empty value overwrite logic
  const missingKeys = availableKeys.filter((key) => {
    if (!(key in current)) {
      return true // Key doesn't exist, add it
    }

    // Key exists - check if we should overwrite empty values
    if (
      overwriteEmptyValues &&
      current[key] === "" &&
      templateParsed[key] &&
      templateParsed[key].trim() !== ""
    ) {
      return true // Overwrite empty value with non-empty template value
    }

    return false
  })

  appendMissingVariables(envPath, missingKeys, templateParsed, dryRun)

  const missingKeyValues = missingKeys.reduce(
    (acc, key) => {
      acc[key] = getValueForKey(key, templateParsed)
      return acc
    },
    {} as Record<string, string>
  )

  return {
    bootstrapped: false,
    missingCount: missingKeys.length,
    missingKeys,
    missingKeyValues
  }
}
