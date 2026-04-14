import { spawnSync } from "node:child_process"

const OP_REFERENCE_PATTERN_GLOBAL = /op:\/\/[^\s"']+/g

export function hasOpReferences(content: string): boolean {
  return /op:\/\/[^\s"']+/.test(content)
}

export function maskOpReferences(content: string): string {
  return content.replace(
    OP_REFERENCE_PATTERN_GLOBAL,
    (ref) => `<resolved from ${ref}>`
  )
}

/**
 * Finds dotenv lines containing an unquoted `op://` reference. Unquoted refs
 * are rejected because after `op inject` substitutes the reference, any `#`
 * in the resolved secret would be interpreted by `dotenv.parse` as a comment
 * start — silently truncating the value.
 */
export function findUnquotedOpReferences(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => {
    const trimmed = line.trimStart()
    if (trimmed.startsWith("#")) return false
    return /=\s*op:\/\//.test(trimmed)
  })
}

export function classifyOpInjectError(
  status: number | null,
  stderr: string
): string {
  const scrubbed = maskOpReferences(stderr.trim())
  const lower = scrubbed.toLowerCase()

  if (
    lower.includes("not signed in") ||
    lower.includes("sign in") ||
    lower.includes("authenticate")
  ) {
    return "op inject failed: not signed in to 1Password. Run `op signin` and try again."
  }

  if (
    lower.includes("could not resolve") ||
    lower.includes("unable to resolve") ||
    lower.includes("no item found") ||
    lower.includes("isn't a file")
  ) {
    return `op inject could not resolve one or more references. Check that every op:// path in your template exists in your vault.\n${scrubbed}`
  }

  return `op inject failed (exit ${status ?? "unknown"}): ${scrubbed}`
}

export function spawnOpInject(content: string): string {
  const result = spawnSync("op", ["inject"], {
    input: content,
    encoding: "utf8"
  })

  if (result.error) {
    const err = result.error as NodeJS.ErrnoException
    if (err.code === "ENOENT") {
      throw new Error(
        "1Password CLI (`op`) not found on PATH. Install it from https://developer.1password.com/docs/cli or drop the --resolve-op flag."
      )
    }
    throw new Error(`Failed to run op inject: ${err.message}`)
  }

  if (result.status !== 0) {
    throw new Error(classifyOpInjectError(result.status, result.stderr ?? ""))
  }

  return result.stdout ?? ""
}
