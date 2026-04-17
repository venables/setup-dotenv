import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"

import { syncDotenv } from "./sync.js"

describe("syncDotenv", () => {
  const testEnvPath = ".env.sync.test"
  const testExamplePath = ".env.example.sync.test"

  beforeEach(() => {
    // Clean up any existing test files
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
    if (existsSync(testExamplePath)) unlinkSync(testExamplePath)
  })

  afterEach(() => {
    // Clean up test files
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
    if (existsSync(testExamplePath)) unlinkSync(testExamplePath)
  })

  it("bootstraps .env from .env.example when .env does not exist", () => {
    const exampleContent = "API_KEY=example_key\nDB_URL=postgres://localhost"
    writeFileSync(testExamplePath, exampleContent)

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["API_KEY", "DB_URL"])
    expect(existsSync(testEnvPath)).toBe(true)
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe("API_KEY=example_key\nDB_URL=postgres://localhost")
  })

  it("returns no changes when all variables are present", () => {
    const content = "API_KEY=my_key\nDB_URL=postgres://prod"
    writeFileSync(testEnvPath, content)
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(0)
    expect(result.missingKeys).toEqual([])
    expect(readFileSync(testEnvPath, "utf8")).toBe(content)
  })

  it("appends missing variables to existing .env", () => {
    writeFileSync(testEnvPath, "API_KEY=my_key")
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost\nDEBUG=true"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["DB_URL", "DEBUG"])

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain("API_KEY=my_key")
    expect(envContent).toContain('DB_URL="postgres://localhost"')
    expect(envContent).toContain('DEBUG="true"')
  })

  it("handles empty .env file", () => {
    writeFileSync(testEnvPath, "")
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["API_KEY", "DB_URL"])

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain('API_KEY="example_key"')
    expect(envContent).toContain('DB_URL="postgres://localhost"')
  })

  it("handles .env with comments and empty lines", () => {
    writeFileSync(
      testEnvPath,
      "# This is a comment\nAPI_KEY=my_key\n\n# Another comment"
    )
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(1)
    expect(result.missingKeys).toEqual(["DB_URL"])
  })

  it("shows what would be copied in dry run mode", () => {
    writeFileSync(testEnvPath, "API_KEY=my_key")
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost\nDEBUG=true"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath,
      dryRun: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["DB_URL", "DEBUG"])

    // File should not be modified in dry run
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe("API_KEY=my_key")
    expect(envContent).not.toContain("DB_URL")
    expect(envContent).not.toContain("DEBUG")
  })

  it("shows bootstrap in dry run mode", () => {
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost\nDEBUG=true"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath,
      dryRun: true
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(3)
    expect(result.missingKeys).toEqual(["API_KEY", "DB_URL", "DEBUG"])

    // File should not be created in dry run
    expect(existsSync(testEnvPath)).toBe(false)
  })

  it("overwrites empty values by default when source has non-empty value", () => {
    writeFileSync(testEnvPath, 'API_KEY=my_key\nDB_URL=""\nDEBUG=false')
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost\nDEBUG=\nNEW_VAR=value"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingKeys).toContain("DB_URL") // Should overwrite empty string
    expect(result.missingKeys).toContain("NEW_VAR") // Should add new variable
    expect(result.missingKeys).not.toContain("DEBUG") // Empty source, non-empty target - no overwrite

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain('DB_URL="postgres://localhost"')
    expect(envContent).toContain('NEW_VAR="value"')
  })

  it("replaces empty lines in place instead of leaving duplicates behind", () => {
    writeFileSync(
      testEnvPath,
      "GOOGLE_CLIENT_ID=\nGOOGLE_CLIENT_SECRET=\nKEEP_ME=stay"
    )
    writeFileSync(
      testExamplePath,
      "GOOGLE_CLIENT_ID=id_value\nGOOGLE_CLIENT_SECRET=secret_value\nKEEP_ME=example"
    )

    syncDotenv({ envPath: testEnvPath, templatePath: testExamplePath })

    const envContent = readFileSync(testEnvPath, "utf8")
    // Original empty lines should be gone, not duplicated below.
    expect(envContent).not.toMatch(/^GOOGLE_CLIENT_ID=\s*$/m)
    expect(envContent).not.toMatch(/^GOOGLE_CLIENT_SECRET=\s*$/m)
    // Resolved values present.
    expect(envContent).toContain('GOOGLE_CLIENT_ID="id_value"')
    expect(envContent).toContain('GOOGLE_CLIENT_SECRET="secret_value"')
    // Untouched line still in place, not duplicated.
    expect(envContent.match(/KEEP_ME=stay/g)?.length).toBe(1)
    // Exactly one occurrence of each overwritten key.
    expect(envContent.match(/GOOGLE_CLIENT_ID=/g)?.length).toBe(1)
    expect(envContent.match(/GOOGLE_CLIENT_SECRET=/g)?.length).toBe(1)
  })

  it("preserves order and comments when replacing empty lines in place", () => {
    writeFileSync(
      testEnvPath,
      "# top comment\nFIRST=one\nAPI_KEY=\n# trailing comment\nLAST=done"
    )
    writeFileSync(
      testExamplePath,
      "FIRST=ignored\nAPI_KEY=resolved\nLAST=ignored"
    )

    syncDotenv({ envPath: testEnvPath, templatePath: testExamplePath })

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe(
      '# top comment\nFIRST=one\nAPI_KEY="resolved"\n# trailing comment\nLAST=done\n'
    )
  })

  it("replaces empty lines with trailing comments and preserves the comment", () => {
    writeFileSync(
      testEnvPath,
      'A_KEY= # please fill in\nB_KEY="" # also required\nC_KEY=normal'
    )
    writeFileSync(testExamplePath, "A_KEY=alpha\nB_KEY=bravo\nC_KEY=charlie")

    syncDotenv({ envPath: testEnvPath, templatePath: testExamplePath })

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe(
      'A_KEY="alpha" # please fill in\nB_KEY="bravo" # also required\nC_KEY=normal\n'
    )
    expect(envContent.match(/A_KEY=/g)?.length).toBe(1)
    expect(envContent.match(/B_KEY=/g)?.length).toBe(1)
  })

  it("replaces empty lines that use the `export` prefix", () => {
    writeFileSync(
      testEnvPath,
      'export A_KEY=\nexport B_KEY=""\n  export   C_KEY =  "" # note'
    )
    writeFileSync(testExamplePath, "A_KEY=alpha\nB_KEY=bravo\nC_KEY=charlie")

    syncDotenv({ envPath: testEnvPath, templatePath: testExamplePath })

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain('export A_KEY="alpha"')
    expect(envContent).toContain('export B_KEY="bravo"')
    expect(envContent).toContain('export   C_KEY="charlie" # note')
    // No duplicate key lines.
    expect(envContent.match(/A_KEY=/g)?.length).toBe(1)
    expect(envContent.match(/B_KEY=/g)?.length).toBe(1)
    expect(envContent.match(/C_KEY=/g)?.length).toBe(1)
  })

  it("does not overwrite empty values when --no-overwrite-empty-values is used", () => {
    writeFileSync(testEnvPath, 'API_KEY=my_key\nDB_URL=""')
    writeFileSync(
      testExamplePath,
      "API_KEY=example_key\nDB_URL=postgres://localhost\nNEW_VAR=value"
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath,
      overwriteEmptyValues: false
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingKeys).toEqual(["NEW_VAR"]) // Only missing variables, no empty value overwrite
    expect(result.missingKeys).not.toContain("DB_URL")

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain('DB_URL=""') // Should remain empty
    expect(envContent).toContain('NEW_VAR="value"')
  })

  it("skips empty source values when --skip-empty-source-values is used", () => {
    writeFileSync(
      testExamplePath,
      'API_KEY=example_key\nDB_URL=""\nDEBUG=\nVALID_VAR=value'
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath,
      skipEmptySourceValues: true
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingKeys).toEqual(["API_KEY", "VALID_VAR"]) // Only non-empty variables
    expect(result.missingKeys).not.toContain("DB_URL")
    expect(result.missingKeys).not.toContain("DEBUG")

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain('API_KEY="example_key"')
    expect(envContent).toContain('VALID_VAR="value"')
    expect(envContent).not.toContain("DB_URL")
    expect(envContent).not.toContain("DEBUG")
  })

  it("combines both flags correctly", () => {
    writeFileSync(testEnvPath, 'API_KEY=""\nEXISTING=value')
    writeFileSync(
      testExamplePath,
      'API_KEY=filled_key\nDB_URL=""\nNEW_VAR=new_value'
    )

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath,
      overwriteEmptyValues: false,
      skipEmptySourceValues: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingKeys).toEqual(["NEW_VAR"]) // Only non-empty missing variables
    expect(result.missingKeys).not.toContain("API_KEY") // Empty target but overwrite disabled
    expect(result.missingKeys).not.toContain("DB_URL") // Empty source value skipped

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain('API_KEY=""') // Should remain empty
    expect(envContent).toContain('NEW_VAR="new_value"')
    expect(envContent).not.toContain("DB_URL")
  })

  it("handles empty value overwrite in dry run mode", () => {
    writeFileSync(testEnvPath, 'API_KEY=""\nEXISTING=value')
    writeFileSync(testExamplePath, "API_KEY=filled_key\nNEW_VAR=new_value")

    const result = syncDotenv({
      envPath: testEnvPath,
      templatePath: testExamplePath,
      dryRun: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingKeys).toEqual(["API_KEY", "NEW_VAR"]) // Should include empty value overwrite

    // File should not be modified in dry run
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe('API_KEY=""\nEXISTING=value')
  })

  describe("--resolve-op", () => {
    it("is a no-op when source has no op:// references", () => {
      const exampleContent = "API_KEY=example_key\nDB_URL=postgres://localhost"
      writeFileSync(testExamplePath, exampleContent)

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true
      })

      expect(result.bootstrapped).toBe(true)
      expect(result.missingKeys).toEqual(["API_KEY", "DB_URL"])
      const envContent = readFileSync(testEnvPath, "utf8")
      expect(envContent).toBe(
        "API_KEY=example_key\nDB_URL=postgres://localhost"
      )
    })

    it("masks op:// values in dry-run output", () => {
      const exampleContent = [
        "DB_URL=postgres://localhost",
        'API_KEY="op://vault/api/key"'
      ].join("\n")
      writeFileSync(testExamplePath, exampleContent)

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true,
        dryRun: true
      })

      expect(result.bootstrapped).toBe(true)
      expect(result.missingKeyValues?.["API_KEY"]).toBe(
        "<resolved from op://vault/api/key>"
      )
      expect(result.missingKeyValues?.["DB_URL"]).toBe("postgres://localhost")
      expect(existsSync(testEnvPath)).toBe(false)
    })

    it("performs a literal copy when op:// references exist but resolveOp is off", () => {
      const exampleContent = 'API_KEY="op://vault/api/key"'
      writeFileSync(testExamplePath, exampleContent)

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath
      })

      expect(result.bootstrapped).toBe(true)
      expect(result.missingKeyValues?.["API_KEY"]).toBe("op://vault/api/key")
    })

    // sync mode (existing .env) with --resolve-op.
    it("appends a new op:// ref to an existing .env with masking in dry-run", () => {
      writeFileSync(testEnvPath, "EXISTING=keepme")
      writeFileSync(
        testExamplePath,
        ["EXISTING=unused", 'NEW_SECRET="op://vault/new/secret"'].join("\n")
      )

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true,
        dryRun: true
      })

      expect(result.bootstrapped).toBe(false)
      expect(result.missingKeys).toEqual(["NEW_SECRET"])
      expect(result.missingKeyValues?.["NEW_SECRET"]).toBe(
        "<resolved from op://vault/new/secret>"
      )
      // Existing file untouched in dry-run
      expect(readFileSync(testEnvPath, "utf8")).toBe("EXISTING=keepme")
    })

    // Codex #2: reject unquoted op:// refs to prevent dotenv # truncation.
    it("rejects unquoted op:// references with a clear error", () => {
      writeFileSync(testExamplePath, "API_KEY=op://vault/api/key")

      expect(() =>
        syncDotenv({
          envPath: testEnvPath,
          templatePath: testExamplePath,
          resolveOp: true
        })
      ).toThrow(/quote the following line/i)
      expect(existsSync(testEnvPath)).toBe(false)
    })

    it("preserves template comments on bootstrap (whole-file op inject)", () => {
      // Dry-run so we don't shell out to op; what we're verifying is that the
      // mask pass preserves the raw template structure (comments, blank
      // lines) rather than reconstructing KEY="value" lines.
      const exampleContent = [
        "# Database configuration",
        "DB_URL=postgres://localhost",
        "",
        "# Third-party API credentials",
        'API_KEY="op://vault/api/key"'
      ].join("\n")
      writeFileSync(testExamplePath, exampleContent)

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true,
        dryRun: true
      })

      expect(result.bootstrapped).toBe(true)
      // In dry-run we don't write, so we can only verify the parsed result
      expect(result.missingKeys).toEqual(["DB_URL", "API_KEY"])
      expect(result.missingKeyValues?.["API_KEY"]).toBe(
        "<resolved from op://vault/api/key>"
      )
    })
  })

  describe("--refresh-op", () => {
    it("force-overwrites resolved op:// values in dry-run", () => {
      writeFileSync(testEnvPath, 'NAME="Matt"\nKEEP=value')
      writeFileSync(
        testExamplePath,
        ['NAME="op://vault/person/name"', "KEEP=ignored"].join("\n")
      )

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true,
        refreshOp: true,
        dryRun: true
      })

      expect(result.missingKeys).toContain("NAME")
      expect(result.missingKeys).not.toContain("KEEP")
      expect(result.missingKeyValues?.["NAME"]).toBe(
        "<resolved from op://vault/person/name>"
      )
      expect(readFileSync(testEnvPath, "utf8")).toBe('NAME="Matt"\nKEEP=value')
    })

    it("leaves non-op keys untouched during refresh", () => {
      writeFileSync(testEnvPath, 'NAME="Matt"\nDB_URL=postgres://prod')
      writeFileSync(
        testExamplePath,
        ['NAME="op://vault/person/name"', "DB_URL=postgres://localhost"].join(
          "\n"
        )
      )

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true,
        refreshOp: true,
        dryRun: true
      })

      expect(result.missingKeys).toEqual(["NAME"])
    })

    it("does not refresh op:// keys without the flag", () => {
      writeFileSync(testEnvPath, 'NAME="Matt"')
      writeFileSync(testExamplePath, 'NAME="op://vault/person/name"')

      const result = syncDotenv({
        envPath: testEnvPath,
        templatePath: testExamplePath,
        resolveOp: true,
        dryRun: true
      })

      expect(result.missingCount).toBe(0)
      expect(result.missingKeys).toEqual([])
    })
  })
})
