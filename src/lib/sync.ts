import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { parse } from "dotenv"

import { getValueForKey, type SetupResult, type SyncOptions } from "./common"
import {
  findUnquotedOpReferences,
  hasOpReferences,
  maskOpReferences,
  spawnOpInject
} from "./op"

interface DetailedSetupResult extends SetupResult {
  missingKeyValues?: Record<string, string>
}

function resolveTemplateContent(
  rawContent: string,
  resolveOp: boolean,
  dryRun?: boolean
): string {
  if (!resolveOp) return rawContent
  if (!hasOpReferences(rawContent)) return rawContent

  if (dryRun) {
    return maskOpReferences(rawContent)
  }

  const unquoted = findUnquotedOpReferences(rawContent)
  if (unquoted.length > 0) {
    throw new Error(
      `--resolve-op requires op:// references to be quoted so resolved values survive parsing. Quote the following line(s) in your template:\n${unquoted.map((line) => `  ${line}`).join("\n")}`
    )
  }

  return spawnOpInject(rawContent)
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
    skipEmptySourceValues = false,
    resolveOp = false
  } = options

  const rawTemplateContent = readFileSync(templatePath, "utf8")
  const templateContent = resolveTemplateContent(
    rawTemplateContent,
    resolveOp,
    dryRun
  )
  const templateParsed = parse(templateContent)

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

  const current = parse(readFileSync(envPath, "utf8"))
  const availableKeys = getKeysToProcess(
    templateParsed,
    variables,
    skipEmptySourceValues
  )

  const missingKeys = availableKeys.filter((key) => {
    if (!(key in current)) return true

    if (
      overwriteEmptyValues &&
      current[key] === "" &&
      templateParsed[key] &&
      templateParsed[key].trim() !== ""
    ) {
      return true
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
