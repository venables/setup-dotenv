import { existsSync, readFileSync, writeFileSync } from "node:fs"

import { parse } from "dotenv"

import { getValueForKey, type SetupResult, type SyncOptions } from "./common"
import {
  findOpReferenceKeys,
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
  skipEmptySourceValues?: boolean
): string[] {
  const allTemplateKeys = Object.keys(templateParsed)
  if (!skipEmptySourceValues) return allTemplateKeys

  return allTemplateKeys.filter(
    (key) => templateParsed[key] && templateParsed[key].trim() !== ""
  )
}

function bootstrapEnvFile(
  envPath: string,
  templateContent: string,
  templateParsed: Record<string, string>,
  keysToBootstrap: string[],
  dryRun?: boolean,
  skipEmptySourceValues?: boolean
): void {
  if (dryRun) return

  if (skipEmptySourceValues) {
    const filteredLines = keysToBootstrap.map(
      (key) => `${key}="${getValueForKey(key, templateParsed)}"`
    )
    writeFileSync(envPath, `${filteredLines.join("\n")}\n`)
    return
  }

  writeFileSync(envPath, templateContent)
}

// Matches a line whose key has an empty value, tolerating every form that
// `dotenv.parse` also treats as empty: optional leading whitespace, optional
// `export` prefix, optional empty quote pair (`""` or `''`), and optional
// trailing `# comment`. Capture groups:
//   1 = leading indent
//   2 = `export ` prefix including trailing whitespace, or undefined
//   3 = key
//   4 = comment body starting at `#`, or undefined
const EMPTY_VALUE_LINE =
  /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:""|'')?\s*(#.*)?\s*$/

// Matches any `KEY=value` line regardless of value contents. Used by
// `--refresh-op` so we can rewrite lines whose key already has a resolved
// value. Same capture-group layout as `EMPTY_VALUE_LINE`.
const ANY_VALUE_LINE =
  /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s#]*)\s*(#.*)?\s*$/

function formatLine(key: string, defaults: Record<string, string>): string {
  return `${key}="${getValueForKey(key, defaults)}"`
}

function rebuildLine(
  match: RegExpMatchArray,
  key: string,
  defaults: Record<string, string>
): string {
  const indent = match[1] ?? ""
  const exportPrefix = match[2] ?? ""
  const comment = match[4] ? ` ${match[4]}` : ""
  return `${indent}${exportPrefix}${formatLine(key, defaults)}${comment}`
}

function writeChanges(
  envPath: string,
  overwriteKeys: string[],
  newKeys: string[],
  refreshKeys: string[],
  defaults: Record<string, string>,
  dryRun?: boolean
): void {
  if (dryRun) return
  if (overwriteKeys.length === 0 && newKeys.length === 0) return

  if (overwriteKeys.length === 0) {
    const lines = newKeys.map((k) => formatLine(k, defaults))
    writeFileSync(envPath, `\n${lines.join("\n")}\n`, { flag: "a" })
    return
  }

  const existing = readFileSync(envPath, "utf8")
  const hadTrailingNewline = existing.endsWith("\n")
  const rawLines = existing.split(/\r?\n/)
  const bodyLines = hadTrailingNewline ? rawLines.slice(0, -1) : rawLines

  const overwriteSet = new Set(overwriteKeys)
  const refreshSet = new Set(refreshKeys)
  const replaced = new Set<string>()
  const transformed: string[] = []

  for (const line of bodyLines) {
    // Refresh path: match any key=value line for a refresh key and rewrite.
    if (refreshSet.size > 0) {
      const anyMatch = line.match(ANY_VALUE_LINE)
      const anyKey = anyMatch?.[3]
      if (anyKey && refreshSet.has(anyKey)) {
        if (replaced.has(anyKey)) continue
        replaced.add(anyKey)
        transformed.push(rebuildLine(anyMatch, anyKey, defaults))
        continue
      }
    }

    // Empty-value overwrite path: only rewrite if the current line matches the
    // strict empty-value form. This protects non-refresh keys that may have
    // been hand-edited to a meaningful value.
    const emptyMatch = line.match(EMPTY_VALUE_LINE)
    const emptyKey = emptyMatch?.[3]
    if (!emptyKey || !overwriteSet.has(emptyKey) || refreshSet.has(emptyKey)) {
      transformed.push(line)
      continue
    }
    if (replaced.has(emptyKey)) continue
    replaced.add(emptyKey)
    transformed.push(rebuildLine(emptyMatch, emptyKey, defaults))
  }

  const missedOverwrites = overwriteKeys.filter((k) => !replaced.has(k))

  // Any key flagged for overwrite that we couldn't match is an edge case our
  // regexes don't understand. Append it and warn loudly so the duplicate is
  // visible.
  if (missedOverwrites.length > 0) {
    console.warn(
      `warning: could not locate line(s) for ${missedOverwrites.join(", ")} in ${envPath}; appending at end of file. The original line(s) will remain and should be removed manually.`
    )
  }

  for (const key of [...missedOverwrites, ...newKeys]) {
    transformed.push(formatLine(key, defaults))
  }

  writeFileSync(envPath, `${transformed.join("\n")}\n`)
}

export function syncDotenv(options: SyncOptions): DetailedSetupResult {
  const {
    envPath,
    templatePath,
    dryRun,
    overwriteEmptyValues = true,
    skipEmptySourceValues = false,
    resolveOp = false,
    refreshOp = false
  } = options

  const rawTemplateContent = readFileSync(templatePath, "utf8")

  // Capture op:// keys from the raw template before resolution, so refreshOp
  // knows which keys to force-overwrite even when the target already has a
  // resolved (non-empty) value.
  const rawOpKeys =
    refreshOp && resolveOp ? findOpReferenceKeys(rawTemplateContent) : []

  const templateContent = resolveTemplateContent(
    rawTemplateContent,
    resolveOp,
    dryRun
  )
  const templateParsed = parse(templateContent)

  if (!existsSync(envPath)) {
    const keysToBootstrap = getKeysToProcess(
      templateParsed,
      skipEmptySourceValues
    )

    bootstrapEnvFile(
      envPath,
      templateContent,
      templateParsed,
      keysToBootstrap,
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
  const availableKeys = getKeysToProcess(templateParsed, skipEmptySourceValues)

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

  // Keys whose raw template value was an op:// ref but which are already
  // present (with any value) in the target. These get a force-overwrite.
  const refreshKeys = refreshOp
    ? rawOpKeys.filter(
        (key) =>
          key in current &&
          !missingKeys.includes(key) &&
          availableKeys.includes(key)
      )
    : []

  const allChangedKeys = [...missingKeys, ...refreshKeys]
  const overwriteKeys = allChangedKeys.filter((key) => key in current)
  const newKeys = allChangedKeys.filter((key) => !(key in current))

  writeChanges(
    envPath,
    overwriteKeys,
    newKeys,
    refreshKeys,
    templateParsed,
    dryRun
  )

  const missingKeyValues = allChangedKeys.reduce(
    (acc, key) => {
      acc[key] = getValueForKey(key, templateParsed)
      return acc
    },
    {} as Record<string, string>
  )

  return {
    bootstrapped: false,
    missingCount: allChangedKeys.length,
    missingKeys: allChangedKeys,
    missingKeyValues
  }
}
