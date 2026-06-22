import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

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

/** A whole-line dotenv comment: the first non-whitespace character is `#`. */
function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("#")
}

/**
 * Finds dotenv lines containing an unquoted `op://` reference. Unquoted refs
 * are rejected because after `op inject` substitutes the reference, any `#`
 * in the resolved secret would be interpreted by `dotenv.parse` as a comment
 * start — silently truncating the value.
 */
export function findUnquotedOpReferences(content: string): string[] {
  return content.split(/\r?\n/).filter((line) => {
    if (isCommentLine(line)) return false
    return /=\s*op:\/\//.test(line)
  })
}

/**
 * Builds the placeholder swapped in for a commented `op://` line. The token
 * deliberately contains no `op://`, so `op inject` passes it through untouched
 * and `restoreProtectedComments` can find it to swap back.
 */
function protectedCommentToken(index: number): string {
  return `__SETUP_DOTENV_PROTECTED_COMMENT_${index}__`
}

function isCommentedOpLine(line: string): boolean {
  return isCommentLine(line) && line.includes("op://")
}

/**
 * `op inject` does blind text substitution — it resolves an `op://` reference on
 * a `#`-commented line exactly like an active one. For a dotenv template that is
 * wrong twice over: the commented item may not exist (failing the whole inject),
 * and if it does exist its secret is written into a plaintext comment. So we
 * swap each commented `op://` line for a sentinel before injecting and restore
 * it verbatim afterward (`restoreProtectedComments`).
 *
 * Only whole-line comments are protected; an `op://` in a trailing comment on an
 * active assignment is still left for `op inject`.
 */
export function protectCommentedOpReferences(content: string): {
  protectedContent: string
  protectedLines: string[]
} {
  const protectedLines: string[] = []
  const lines = content.split(/\r?\n/).map((line) => {
    if (!isCommentedOpLine(line)) return line
    const token = protectedCommentToken(protectedLines.length)
    protectedLines.push(line)
    return token
  })

  // No commented refs: return the input untouched. Load-bearing, not a
  // micro-optimisation — the rejoin below collapses to one EOL, so a file with
  // mixed line endings only survives byte-for-byte on this early-return path.
  if (protectedLines.length === 0) {
    return { protectedContent: content, protectedLines }
  }

  // Rejoin on the dominant line ending so a CRLF template isn't silently
  // rewritten to LF.
  const eol = content.includes("\r\n") ? "\r\n" : "\n"
  return { protectedContent: lines.join(eol), protectedLines }
}

/**
 * Inverse of `protectCommentedOpReferences`: swaps each sentinel back to its
 * original comment line. Matching on the sentinel text rather than line position
 * keeps this correct even if `op inject` changed the line count — e.g. a
 * resolved secret that spanned multiple lines.
 */
export function restoreProtectedComments(
  injected: string,
  protectedLines: string[]
): string {
  return protectedLines.reduce(
    (acc, line, index) => acc.split(protectedCommentToken(index)).join(line),
    injected
  )
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
  // We pass content to `op inject` via a temp file rather than stdin because
  // some `op` versions (observed on 2.34.0-beta) fail to read from a Node-
  // supplied stdin pipe and exit with "expected data on stdin but none found",
  // even though the same invocation works from a real shell pipeline. The
  // template contains op:// references (pointers, not resolved secrets), so
  // the temp file itself is not sensitive; we still place it inside a
  // private temp directory and remove it unconditionally.
  const dir = mkdtempSync(join(tmpdir(), "setup-dotenv-"))
  const templateFile = join(dir, "template")

  try {
    writeFileSync(templateFile, content)

    const result = spawnSync("op", ["inject", "-i", templateFile], {
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
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
