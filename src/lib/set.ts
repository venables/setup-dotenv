import { existsSync, readFileSync, writeFileSync } from "node:fs"

export interface SetOptions {
  envPath: string
  key: string
  value: string
  dryRun?: boolean
  force?: boolean
}

export type SetResult =
  | { status: "created" }
  | { status: "appended" }
  | { status: "overwrote" }
  | { status: "skipped" }

// Matches any KEY=value line, tolerating leading whitespace, optional `export`
// prefix, quoted or unquoted values, and trailing `# comment`. Capture groups
// match sync.ts's ANY_VALUE_LINE for consistent in-place rewrite semantics:
//   1 = leading indent
//   2 = `export ` prefix including trailing whitespace, or undefined
//   3 = key
//   4 = comment body starting at `#`, or undefined
const KEY_LINE =
  /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s#]*)\s*(#.*)?\s*$/

function keyOf(line: string): string | undefined {
  return line.match(KEY_LINE)?.[3]
}

function rebuildLine(
  match: RegExpMatchArray,
  key: string,
  value: string
): string {
  const indent = match[1] ?? ""
  const exportPrefix = match[2] ?? ""
  const comment = match[4] ? ` ${match[4]}` : ""
  return `${indent}${exportPrefix}${key}="${value}"${comment}`
}

export function existsInEnv(envPath: string, key: string): boolean {
  if (!existsSync(envPath)) return false
  const content = readFileSync(envPath, "utf8")
  return content.split(/\r?\n/).some((line) => keyOf(line) === key)
}

export function setValue(options: SetOptions): SetResult {
  const { envPath, key, value, dryRun, force } = options

  if (!existsSync(envPath)) {
    if (!dryRun) {
      writeFileSync(envPath, `${key}="${value}"\n`)
    }
    return { status: "created" }
  }

  const content = readFileSync(envPath, "utf8")
  const lines = content.split(/\r?\n/)

  const existingIndex = lines.findIndex((line) => keyOf(line) === key)

  if (existingIndex === -1) {
    if (!dryRun) {
      const suffix = content.endsWith("\n") ? "" : "\n"
      writeFileSync(envPath, `${content}${suffix}${key}="${value}"\n`)
    }
    return { status: "appended" }
  }

  if (!force) {
    return { status: "skipped" }
  }

  if (!dryRun) {
    const updatedLines = lines.map((line) => {
      const match = line.match(KEY_LINE)
      if (match?.[3] !== key) return line
      return rebuildLine(match, key, value)
    })
    writeFileSync(envPath, updatedLines.join("\n"))
  }
  return { status: "overwrote" }
}
