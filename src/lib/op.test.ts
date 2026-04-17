import { describe, expect, it } from "bun:test"

import {
  classifyOpInjectError,
  classifyOpReadError,
  findOpReferenceKeys,
  findUnquotedOpReferences,
  hasOpReferences,
  maskOpReferences
} from "./op.js"

describe("hasOpReferences", () => {
  it("detects a single op:// reference in quoted value", () => {
    expect(hasOpReferences('API_KEY="op://vault/item/field"')).toBe(true)
  })

  it("detects an unquoted op:// reference", () => {
    expect(hasOpReferences("API_KEY=op://vault/item/field")).toBe(true)
  })

  it("detects references across multiple lines", () => {
    const content = [
      "DB_URL=postgres://localhost/mydb",
      'API_KEY="op://vault/api/key"',
      'JWT_SECRET="op://vault/jwt/secret"'
    ].join("\n")
    expect(hasOpReferences(content)).toBe(true)
  })

  it("returns false when no op:// references exist", () => {
    const content = "DB_URL=postgres://localhost/mydb\nAPI_KEY=hardcoded"
    expect(hasOpReferences(content)).toBe(false)
  })

  it("returns false for empty content", () => {
    expect(hasOpReferences("")).toBe(false)
  })
})

describe("findUnquotedOpReferences", () => {
  it("returns an empty array when all refs are double-quoted", () => {
    const content = [
      'API_KEY="op://vault/api/key"',
      'JWT="op://vault/jwt/secret"'
    ].join("\n")
    expect(findUnquotedOpReferences(content)).toEqual([])
  })

  it("returns an empty array when all refs are single-quoted", () => {
    const content = "API_KEY='op://vault/api/key'"
    expect(findUnquotedOpReferences(content)).toEqual([])
  })

  it("flags a bare unquoted ref", () => {
    const content = "API_KEY=op://vault/api/key"
    expect(findUnquotedOpReferences(content)).toEqual([
      "API_KEY=op://vault/api/key"
    ])
  })

  it("flags unquoted refs with whitespace after the equals sign", () => {
    const content = "API_KEY= op://vault/api/key"
    expect(findUnquotedOpReferences(content)).toEqual([
      "API_KEY= op://vault/api/key"
    ])
  })

  it("ignores op:// references inside comments", () => {
    const content = "# example: API_KEY=op://vault/api/key"
    expect(findUnquotedOpReferences(content)).toEqual([])
  })

  it("returns multiple bad lines preserving order", () => {
    const content = [
      "DB_URL=postgres://localhost",
      "API_KEY=op://vault/api/key",
      'JWT="op://vault/jwt/secret"',
      "SESSION=op://vault/session/secret"
    ].join("\n")
    expect(findUnquotedOpReferences(content)).toEqual([
      "API_KEY=op://vault/api/key",
      "SESSION=op://vault/session/secret"
    ])
  })
})

describe("findOpReferenceKeys", () => {
  it("returns keys whose quoted value is an op:// ref", () => {
    const content = [
      'API_KEY="op://vault/api/key"',
      "DB_URL=postgres://localhost",
      "JWT='op://vault/jwt'"
    ].join("\n")
    expect(findOpReferenceKeys(content)).toEqual(["API_KEY", "JWT"])
  })

  it("handles export prefixes and leading whitespace", () => {
    const content = '  export API_KEY="op://vault/api/key"'
    expect(findOpReferenceKeys(content)).toEqual(["API_KEY"])
  })

  it("ignores op:// references inside comments", () => {
    const content = '# API_KEY="op://vault/api/key"'
    expect(findOpReferenceKeys(content)).toEqual([])
  })

  it("ignores unquoted op:// values (those would be rejected anyway)", () => {
    const content = "API_KEY=op://vault/api/key"
    expect(findOpReferenceKeys(content)).toEqual([])
  })

  it("returns an empty array for content without op:// references", () => {
    expect(findOpReferenceKeys("API_KEY=hardcoded\nPORT=3000")).toEqual([])
  })
})

describe("maskOpReferences", () => {
  it("masks a single op:// reference", () => {
    expect(maskOpReferences('API_KEY="op://vault/item/field"')).toBe(
      'API_KEY="<resolved from op://vault/item/field>"'
    )
  })

  it("masks multiple references in the same file", () => {
    const content = [
      'API_KEY="op://vault/api/key"',
      'JWT_SECRET="op://vault/jwt/secret"'
    ].join("\n")
    const masked = maskOpReferences(content)
    expect(masked).toContain("<resolved from op://vault/api/key>")
    expect(masked).toContain("<resolved from op://vault/jwt/secret>")
  })

  it("leaves non-op values untouched", () => {
    const content = "DB_URL=postgres://localhost/mydb\nPORT=3000"
    expect(maskOpReferences(content)).toBe(content)
  })
})

describe("classifyOpInjectError", () => {
  it("detects not-signed-in errors", () => {
    const msg = classifyOpInjectError(
      1,
      "[ERROR] You are not signed in to 1Password"
    )
    expect(msg).toContain("not signed in")
    expect(msg).toContain("op signin")
  })

  it("detects unresolvable references", () => {
    const msg = classifyOpInjectError(
      1,
      '[ERROR] could not resolve "op://vault/item/field": no item found'
    )
    expect(msg).toContain("could not resolve")
  })

  it("falls back to generic failure message with exit code", () => {
    const msg = classifyOpInjectError(7, "unexpected error at connection layer")
    expect(msg).toContain("exit 7")
    expect(msg).toContain("unexpected error")
  })

  it("scrubs op:// references out of surfaced stderr", () => {
    const msg = classifyOpInjectError(
      1,
      'could not resolve "op://vault/api/key": no item found'
    )
    expect(msg).toContain("<resolved from op://vault/api/key>")
    const stderrPortion = msg.split("\n").slice(1).join("\n")
    expect(stderrPortion).not.toContain('"op://vault/api/key"')
  })

  it("handles null exit status", () => {
    const msg = classifyOpInjectError(null, "process killed")
    expect(msg).toContain("unknown")
  })
})

describe("classifyOpReadError", () => {
  it("detects not-signed-in errors", () => {
    const msg = classifyOpReadError(
      1,
      "[ERROR] You are not signed in to 1Password"
    )
    expect(msg).toContain("not signed in")
    expect(msg).toContain("op signin")
  })

  it("detects unresolvable references", () => {
    const msg = classifyOpReadError(
      1,
      'could not resolve "op://vault/item/field": no item found'
    )
    expect(msg).toContain("could not resolve")
  })

  it("detects invalid secret reference format", () => {
    const msg = classifyOpReadError(1, '"foo" isn\'t a secret reference')
    expect(msg).toContain("could not resolve")
  })

  it("falls back to generic failure message", () => {
    const msg = classifyOpReadError(7, "unexpected error")
    expect(msg).toContain("exit 7")
    expect(msg).toContain("op read failed")
  })

  it("scrubs op:// references from stderr", () => {
    const msg = classifyOpReadError(
      1,
      'could not resolve "op://vault/api/key": no item found'
    )
    expect(msg).toContain("<resolved from op://vault/api/key>")
  })
})
