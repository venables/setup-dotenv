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
// The rebuilt line is `${m[1]}${m[2] ?? ""}${m[3]}="value"` with ` ${m[4]}`
// appended when a comment was present. Whitespace around `=` is canonicalised
// away, which is a minor cosmetic change but keeps the rebuild predictable.
const EMPTY_VALUE_LINE =
  /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:""|'')?\s*(#.*)?\s*$/

function formatLine(key: string, defaults: Record<string, string>): string {
  return `${key}="${getValueForKey(key, defaults)}"`
}

function writeChanges(
  envPath: string,
  overwriteKeys: string[],
  newKeys: string[],
  defaults: Record<string, string>,
  dryRun?: boolean
): void {
  if (dryRun) return
  if (overwriteKeys.length === 0 && newKeys.length === 0) return

  // Fast path: no in-place rewrites needed, append new keys to end of file.
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
  const replaced = new Set<string>()
  const transformed: string[] = []

  for (const line of bodyLines) {
    const match = line.match(EMPTY_VALUE_LINE)
    const key = match?.[3]
    if (!key || !overwriteSet.has(key)) {
      transformed.push(line)
      continue
    }
    // First empty line for this key becomes the new value; any subsequent
    // empty lines for the same key are dropped so dotenv's last-occurrence
    // rule can't clobber the value we just wrote.
    if (replaced.has(key)) continue
    replaced.add(key)
    const indent = match[1] ?? ""
    const exportPrefix = match[2] ?? ""
    const comment = match[4] ? ` ${match[4]}` : ""
    transformed.push(
      `${indent}${exportPrefix}${formatLine(key, defaults)}${comment}`
    )
  }

  const missedOverwrites = overwriteKeys.filter((k) => !replaced.has(k))

  // Any key flagged for overwrite that we couldn't match as an empty line is
  // an edge case our regex doesn't understand. We still have to write the
  // value somewhere — appending is the least-bad option — but we warn loudly
  // so the user notices the duplicate and can clean up by hand (or report it
  // as a bug so the regex can be widened).
  if (missedOverwrites.length > 0) {
    console.warn(
      `warning: could not locate empty-value line(s) for ${missedOverwrites.join(", ")} in ${envPath}; appending at end of file. The original line(s) will remain and should be removed manually.`
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

  const overwriteKeys = missingKeys.filter((key) => key in current)
  const newKeys = missingKeys.filter((key) => !(key in current))

  writeChanges(envPath, overwriteKeys, newKeys, templateParsed, dryRun)

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
