#!/usr/bin/env node
import process from "node:process"

import { program } from "commander"

import { version } from "../package.json" with { type: "json" }
import { generateRandomValue } from "./lib/common"
import { generateVariables } from "./lib/secret"
import { syncDotenv } from "./lib/sync"

program
  .name("setup-dotenv")
  .description("A CLI tool for setting up and managing .env files")
  .version(version)
  .addHelpText(
    "after",
    `
Example:
  $ setup-dotenv sync                  Copy .env.example to .env (safe: won't overwrite existing values)
  $ setup-dotenv secret AUTH_SECRET    Generate a random value for AUTH_SECRET in .env
  $ setup-dotenv secret                Print a random secret to stdout`
  )

// Sync command
program
  .command("sync")
  .description("Sync environment variables from template to .env file")
  .option("-t, --target <path>", "target .env file (destination)", ".env")
  .option(
    "-s, --source <path>",
    "source file to sync from (e.g., .env.example)",
    ".env.example"
  )
  .option("--only <variables...>", "only copy these specific variables")
  .option("--dry-run", "show what would be copied without making changes")
  .option(
    "--no-overwrite-empty-values",
    "don't overwrite empty values in target file (default: overwrite)"
  )
  .option(
    "--skip-empty-source-values",
    "skip variables with empty values in source file (default: include)"
  )
  .action(
    (options: {
      target: string
      source: string
      only?: string[]
      dryRun?: boolean
      overwriteEmptyValues?: boolean
      skipEmptySourceValues?: boolean
    }) => {
      try {
        const result = syncDotenv({
          envPath: options.target,
          templatePath: options.source,
          variables: options.only,
          dryRun: options.dryRun,
          overwriteEmptyValues: options.overwriteEmptyValues,
          skipEmptySourceValues: options.skipEmptySourceValues
        })

        if (options.dryRun) {
          if (result.bootstrapped) {
            console.log(
              `[DRY RUN] Would create ${options.target} from ${options.source}`
            )
            if (result.missingKeys.length > 0) {
              console.log(`[DRY RUN] Would copy these variables:`)
              result.missingKeys.forEach((key) => {
                const value = result.missingKeyValues?.[key] || ""
                console.log(`  ${key}="${value}"`)
              })
            }
          } else if (result.missingCount === 0) {
            console.log(
              "[DRY RUN] All variables already present – nothing to do."
            )
          } else {
            console.log(
              `[DRY RUN] Would append ${result.missingCount} variable(s) to ${options.target}:`
            )
            result.missingKeys.forEach((key) => {
              const value = result.missingKeyValues?.[key] || ""
              console.log(`  ${key}="${value}"`)
            })
          }
        } else if (result.bootstrapped) {
          console.log(`Created ${options.target} from ${options.source}`)
        } else if (result.missingCount === 0) {
          console.log("All variables already present – nothing to do.")
        } else {
          console.log(
            `Appended ${result.missingCount} variable(s) to ${options.target}`
          )
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error)
        process.exit(1)
      }
    }
  )

// Secret command
program
  .command("secret")
  .description("Generate random base64url values for environment variables")
  .argument("[variables...]", "variable names to generate values for")
  .option("-t, --target <path>", "target .env file", ".env")
  .option("-l, --length <bytes>", "length in bytes for generated values", "32")
  .option("--hex", "use hex encoding instead of base64url")
  .option("--dry-run", "show what would be generated without making changes")
  .option("-f, --force", "overwrite existing values")
  .action(
    (
      variables: string[],
      options: {
        target: string
        length: string
        hex?: boolean
        dryRun?: boolean
        force?: boolean
      }
    ) => {
      try {
        const encoding = options.hex ? "hex" : "base64url"
        const length = parseInt(options.length, 10)

        if (variables.length === 0) {
          process.stdout.write(`${generateRandomValue(length, encoding)}\n`)
          return
        }

        const result = generateVariables({
          envPath: options.target,
          variables,
          length,
          encoding,
          dryRun: options.dryRun,
          force: options.force
        })

        if (options.dryRun) {
          if (result.bootstrapped) {
            console.log(
              `[DRY RUN] Would create ${options.target} with generated values:`
            )
            result.missingKeys.forEach((key) => {
              const value = result.missingKeyValues?.[key] || ""
              console.log(`  ${key}="${value}"`)
            })
          } else if (result.missingKeys.length === 0) {
            console.log(
              `[DRY RUN] All variables already exist in ${options.target} – nothing to do.`
            )
            if (!options.force) {
              console.log(
                `[DRY RUN] Use -f or --force to overwrite existing values.`
              )
            }
          } else if (result.missingKeys.length < variables.length) {
            const existing = variables.filter(
              (v) => !result.missingKeys.includes(v)
            )
            console.log(`[DRY RUN] Would generate values for:`)
            result.missingKeys.forEach((key) => {
              const value = result.missingKeyValues?.[key] || ""
              console.log(`  ${key}="${value}"`)
            })
            console.log(
              `[DRY RUN] Already exist (skipping): ${existing.join(", ")}`
            )
          } else {
            console.log(`[DRY RUN] Would generate values for:`)
            result.missingKeys.forEach((key) => {
              const value = result.missingKeyValues?.[key] || ""
              console.log(`  ${key}="${value}"`)
            })
          }
        } else {
          if (result.bootstrapped) {
            console.log(
              `Created ${options.target} with generated values for: ${variables.join(", ")}`
            )
          } else if (result.missingKeys.length === 0) {
            console.log(
              `All variables already exist in ${options.target} – nothing to do.`
            )
            if (!options.force) {
              console.log(`Use -f or --force to overwrite existing values.`)
            }
          } else if (result.missingKeys.length < variables.length) {
            const existing = variables.filter(
              (v) => !result.missingKeys.includes(v)
            )
            console.log(
              `Generated values for: ${result.missingKeys.join(", ")}`
            )
            if (!options.force) {
              console.log(`Already exist (skipped): ${existing.join(", ")}`)
            }
          } else {
            console.log(
              `Generated values for: ${result.missingKeys.join(", ")}`
            )
          }
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error)
        process.exit(1)
      }
    }
  )

program.parse()
