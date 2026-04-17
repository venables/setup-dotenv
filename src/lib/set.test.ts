import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"

import { existsInEnv, setValue } from "./set"

describe("existsInEnv", () => {
  const testEnvPath = ".env.exists.test"

  afterEach(() => {
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
  })

  it("returns false when file does not exist", () => {
    expect(existsInEnv(testEnvPath, "KEY")).toBe(false)
  })

  it("returns true when key exists with a value", () => {
    writeFileSync(testEnvPath, "KEY=value\n")
    expect(existsInEnv(testEnvPath, "KEY")).toBe(true)
  })

  it("returns true when key exists with an empty value", () => {
    writeFileSync(testEnvPath, 'KEY=""\n')
    expect(existsInEnv(testEnvPath, "KEY")).toBe(true)
  })

  it("returns false when key is not present", () => {
    writeFileSync(testEnvPath, "OTHER=value\n")
    expect(existsInEnv(testEnvPath, "KEY")).toBe(false)
  })

  it("does not match partial key names", () => {
    writeFileSync(testEnvPath, "MY_KEY=value\n")
    expect(existsInEnv(testEnvPath, "KEY")).toBe(false)
  })

  it("recognises keys with the export prefix", () => {
    writeFileSync(testEnvPath, "export KEY=value\n")
    expect(existsInEnv(testEnvPath, "KEY")).toBe(true)
  })

  it("recognises keys with indentation and export prefix", () => {
    writeFileSync(testEnvPath, "  export  KEY=value\n")
    expect(existsInEnv(testEnvPath, "KEY")).toBe(true)
  })
})

describe("setValue", () => {
  const testEnvPath = ".env.set.test"

  beforeEach(() => {
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
  })

  afterEach(() => {
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
  })

  it("creates a new file when none exists", () => {
    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "abc123"
    })

    expect(result.status).toBe("created")
    expect(readFileSync(testEnvPath, "utf8")).toBe('AUTH_SECRET="abc123"\n')
  })

  it("appends to an existing file when key is missing", () => {
    writeFileSync(testEnvPath, "OTHER=keep\n")

    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "abc123"
    })

    expect(result.status).toBe("appended")
    const content = readFileSync(testEnvPath, "utf8")
    expect(content).toContain("OTHER=keep")
    expect(content).toContain('AUTH_SECRET="abc123"')
  })

  it("appends with a newline when file does not end with one", () => {
    writeFileSync(testEnvPath, "OTHER=keep")

    setValue({ envPath: testEnvPath, key: "NEW", value: "val" })

    const content = readFileSync(testEnvPath, "utf8")
    expect(content).toBe('OTHER=keep\nNEW="val"\n')
  })

  it("skips when key already exists", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=existing\n")

    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new_value"
    })

    expect(result.status).toBe("skipped")
    expect(readFileSync(testEnvPath, "utf8")).toBe("AUTH_SECRET=existing\n")
  })

  it("skips when key exists with an empty value", () => {
    writeFileSync(testEnvPath, 'AUTH_SECRET=""\n')

    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new_value"
    })

    expect(result.status).toBe("skipped")
    expect(readFileSync(testEnvPath, "utf8")).toBe('AUTH_SECRET=""\n')
  })

  it("skips when key exists with an export prefix (no duplicate append)", () => {
    writeFileSync(testEnvPath, "export AUTH_SECRET=existing\n")

    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new_value"
    })

    expect(result.status).toBe("skipped")
    expect(readFileSync(testEnvPath, "utf8")).toBe(
      "export AUTH_SECRET=existing\n"
    )
  })

  it("overwrites when --force is used", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=old_value\nOTHER=keep\n")

    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new_value",
      force: true
    })

    expect(result.status).toBe("overwrote")
    const content = readFileSync(testEnvPath, "utf8")
    expect(content).toContain('AUTH_SECRET="new_value"')
    expect(content).toContain("OTHER=keep")
    expect(content).not.toContain("old_value")
  })

  it("preserves export prefix when force-overwriting", () => {
    writeFileSync(testEnvPath, "export AUTH_SECRET=old\nOTHER=keep\n")

    setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new",
      force: true
    })

    const content = readFileSync(testEnvPath, "utf8")
    expect(content).toContain('export AUTH_SECRET="new"')
    expect(content).toContain("OTHER=keep")
  })

  it("preserves trailing comments when force-overwriting", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=old # required in prod\n")

    setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new",
      force: true
    })

    expect(readFileSync(testEnvPath, "utf8")).toBe(
      'AUTH_SECRET="new" # required in prod\n'
    )
  })

  it("preserves indentation, export prefix, and comment together", () => {
    writeFileSync(testEnvPath, '  export AUTH_SECRET="old" # keep me\n')

    setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new",
      force: true
    })

    expect(readFileSync(testEnvPath, "utf8")).toBe(
      '  export AUTH_SECRET="new" # keep me\n'
    )
  })

  it("does not create a file in dry-run mode", () => {
    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "abc123",
      dryRun: true
    })

    expect(result.status).toBe("created")
    expect(existsSync(testEnvPath)).toBe(false)
  })

  it("does not modify an existing file in dry-run mode", () => {
    writeFileSync(testEnvPath, "OTHER=keep\n")

    const result = setValue({
      envPath: testEnvPath,
      key: "NEW",
      value: "val",
      dryRun: true
    })

    expect(result.status).toBe("appended")
    expect(readFileSync(testEnvPath, "utf8")).toBe("OTHER=keep\n")
  })

  it("does not force-overwrite in dry-run mode", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=old\n")

    const result = setValue({
      envPath: testEnvPath,
      key: "AUTH_SECRET",
      value: "new",
      force: true,
      dryRun: true
    })

    expect(result.status).toBe("overwrote")
    expect(readFileSync(testEnvPath, "utf8")).toBe("AUTH_SECRET=old\n")
  })

  it("handles values containing special characters", () => {
    setValue({
      envPath: testEnvPath,
      key: "DB_URL",
      value: "postgres://user:p@ss#word@localhost/db"
    })

    expect(readFileSync(testEnvPath, "utf8")).toBe(
      'DB_URL="postgres://user:p@ss#word@localhost/db"\n'
    )
  })
})
