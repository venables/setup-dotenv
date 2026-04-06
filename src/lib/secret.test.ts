import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"

import { generateVariables } from "./secret"

describe("generateVariables", () => {
  const testEnvPath = ".env.generate.test"

  beforeEach(() => {
    // Clean up any existing test files
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
  })

  afterEach(() => {
    // Clean up test files
    if (existsSync(testEnvPath)) unlinkSync(testEnvPath)
  })

  it("creates new file with generated variables", () => {
    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "JWT_SECRET"]
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["AUTH_SECRET", "JWT_SECRET"])
    expect(existsSync(testEnvPath)).toBe(true)

    const envContent = readFileSync(testEnvPath, "utf8")
    const authSecretMatch = envContent.match(
      /AUTH_SECRET="([A-Za-z0-9_-]{43})"/
    )
    const jwtSecretMatch = envContent.match(/JWT_SECRET="([A-Za-z0-9_-]{43})"/)
    expect(authSecretMatch).toBeTruthy()
    expect(jwtSecretMatch).toBeTruthy()
    expect(authSecretMatch?.[1]).not.toBe(jwtSecretMatch?.[1]) // Different values
  })

  it("appends to existing file", () => {
    writeFileSync(testEnvPath, "API_KEY=existing_key")

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET"]
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(1)
    expect(result.missingKeys).toEqual(["AUTH_SECRET"])

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain("API_KEY=existing_key")

    const authSecretMatch = envContent.match(
      /AUTH_SECRET="([A-Za-z0-9_-]{43})"/
    )
    expect(authSecretMatch).toBeTruthy()
  })

  it("shows what would be generated in dry run mode", () => {
    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "JWT_SECRET"],
      dryRun: true
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["AUTH_SECRET", "JWT_SECRET"])

    // File should not be created in dry run
    expect(existsSync(testEnvPath)).toBe(false)
  })

  it("dry run with existing file", () => {
    writeFileSync(testEnvPath, "API_KEY=existing_key")

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET"],
      dryRun: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(1)
    expect(result.missingKeys).toEqual(["AUTH_SECRET"])

    // File should not be modified in dry run
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe("API_KEY=existing_key")
    expect(envContent).not.toContain("AUTH_SECRET")
  })

  it("generates multiple variables with different values", () => {
    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["SECRET_1", "SECRET_2", "SECRET_3"]
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(3)
    expect(result.missingKeys).toEqual(["SECRET_1", "SECRET_2", "SECRET_3"])

    const envContent = readFileSync(testEnvPath, "utf8")
    const secret1Match = envContent.match(/SECRET_1="([A-Za-z0-9_-]{43})"/)
    const secret2Match = envContent.match(/SECRET_2="([A-Za-z0-9_-]{43})"/)
    const secret3Match = envContent.match(/SECRET_3="([A-Za-z0-9_-]{43})"/)

    expect(secret1Match).toBeTruthy()
    expect(secret2Match).toBeTruthy()
    expect(secret3Match).toBeTruthy()

    // All values should be different
    expect(secret1Match?.[1]).not.toBe(secret2Match?.[1])
    expect(secret1Match?.[1]).not.toBe(secret3Match?.[1])
    expect(secret2Match?.[1]).not.toBe(secret3Match?.[1])
  })

  it("does not overwrite existing variables by default", () => {
    writeFileSync(
      testEnvPath,
      "AUTH_SECRET=existing_secret\nAPI_KEY=existing_key"
    )

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "NEW_SECRET"]
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(1) // Only NEW_SECRET should be generated
    expect(result.missingKeys).toEqual(["NEW_SECRET"])

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toContain("AUTH_SECRET=existing_secret") // Original value preserved
    expect(envContent).toContain("API_KEY=existing_key")
    expect(envContent).toContain("NEW_SECRET=")
    expect(envContent).toMatch(/NEW_SECRET="[A-Za-z0-9_-]{43}"/)
  })

  it("overwrites empty values by default", () => {
    writeFileSync(
      testEnvPath,
      'AUTH_SECRET=""\nAPI_KEY=existing_key\nEMPTY_VAR=""'
    )

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "NEW_SECRET", "EMPTY_VAR"]
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(3) // AUTH_SECRET, NEW_SECRET, and EMPTY_VAR should be generated
    expect(result.missingKeys).toEqual([
      "AUTH_SECRET",
      "NEW_SECRET",
      "EMPTY_VAR"
    ])

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).not.toContain('AUTH_SECRET=""') // Empty value should be replaced
    expect(envContent).not.toContain('EMPTY_VAR=""') // Empty value should be replaced
    expect(envContent).toContain("API_KEY=existing_key") // Non-empty value preserved
    expect(envContent).toMatch(/AUTH_SECRET="[A-Za-z0-9_-]{43}"/) // New value generated
    expect(envContent).toMatch(/NEW_SECRET="[A-Za-z0-9_-]{43}"/) // New value generated
    expect(envContent).toMatch(/EMPTY_VAR="[A-Za-z0-9_-]{43}"/) // Empty value replaced
  })

  it("overwrites existing variables with --force flag", () => {
    writeFileSync(
      testEnvPath,
      "AUTH_SECRET=existing_secret\nAPI_KEY=existing_key"
    )

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "NEW_SECRET"],
      force: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(2) // Both should be generated
    expect(result.missingKeys).toEqual(["AUTH_SECRET", "NEW_SECRET"])

    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).not.toContain("AUTH_SECRET=existing_secret") // Original value should be gone
    expect(envContent).toContain("API_KEY=existing_key") // Unrelated values preserved
    expect(envContent).toMatch(/AUTH_SECRET="[A-Za-z0-9_-]{43}"/) // New value generated
    expect(envContent).toMatch(/NEW_SECRET="[A-Za-z0-9_-]{43}"/)
  })

  it("dry run shows existing variables would be skipped", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=existing_secret")

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "NEW_SECRET"],
      dryRun: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(1) // Only NEW_SECRET would be generated
    expect(result.missingKeys).toEqual(["NEW_SECRET"])

    // File should not be modified in dry run
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe("AUTH_SECRET=existing_secret")
  })

  it("dry run shows empty values would be overwritten", () => {
    writeFileSync(testEnvPath, 'AUTH_SECRET=""\nAPI_KEY=existing_key')

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "NEW_SECRET"],
      dryRun: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(2) // Both AUTH_SECRET and NEW_SECRET would be generated
    expect(result.missingKeys).toEqual(["AUTH_SECRET", "NEW_SECRET"])

    // File should not be modified in dry run
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe('AUTH_SECRET=""\nAPI_KEY=existing_key')
  })

  it("dry run with force shows all variables would be generated", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=existing_secret")

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET", "NEW_SECRET"],
      dryRun: true,
      force: true
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(2) // Both would be generated with force
    expect(result.missingKeys).toEqual(["AUTH_SECRET", "NEW_SECRET"])

    // File should not be modified in dry run
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe("AUTH_SECRET=existing_secret")
  })

  it("handles no variables to generate", () => {
    writeFileSync(testEnvPath, "AUTH_SECRET=existing_secret")

    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["AUTH_SECRET"] // This already exists with non-empty value
    })

    expect(result.bootstrapped).toBe(false)
    expect(result.missingCount).toBe(0) // Nothing to generate
    expect(result.missingKeys).toEqual([])

    // File should be unchanged
    const envContent = readFileSync(testEnvPath, "utf8")
    expect(envContent).toBe("AUTH_SECRET=existing_secret")
  })

  it("generates values with custom length", () => {
    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["SHORT_SECRET", "LONG_SECRET"],
      length: 16 // 16 bytes = 22 base64url characters
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(2)
    expect(result.missingKeys).toEqual(["SHORT_SECRET", "LONG_SECRET"])

    const envContent = readFileSync(testEnvPath, "utf8")
    const shortSecretMatch = envContent.match(
      /SHORT_SECRET="([A-Za-z0-9_-]{22})"/
    )
    const longSecretMatch = envContent.match(
      /LONG_SECRET="([A-Za-z0-9_-]{22})"/
    )
    expect(shortSecretMatch).toBeTruthy()
    expect(longSecretMatch).toBeTruthy()
    expect(shortSecretMatch?.[1]).not.toBe(longSecretMatch?.[1]) // Different values
  })

  it("generates hex values with --hex flag", () => {
    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["HEX_SECRET"],
      encoding: "hex"
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(1)

    const envContent = readFileSync(testEnvPath, "utf8")
    const hexMatch = envContent.match(/HEX_SECRET="([a-f0-9]{64})"/)
    expect(hexMatch).toBeTruthy()
  })

  it("generates values with default length when not specified", () => {
    const result = generateVariables({
      envPath: testEnvPath,
      variables: ["DEFAULT_SECRET"]
    })

    expect(result.bootstrapped).toBe(true)
    expect(result.missingCount).toBe(1)
    expect(result.missingKeys).toEqual(["DEFAULT_SECRET"])

    const envContent = readFileSync(testEnvPath, "utf8")
    // Default is 32 bytes = 43 base64url characters
    const defaultSecretMatch = envContent.match(
      /DEFAULT_SECRET="([A-Za-z0-9_-]{43})"/
    )
    expect(defaultSecretMatch).toBeTruthy()
  })
})
