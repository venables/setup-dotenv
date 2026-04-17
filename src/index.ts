#!/usr/bin/env node
import process from "node:process"

import { program } from "commander"

import { version } from "../package.json" with { type: "json" }
import { maskOpReferences, spawnOpRead } from "./lib/op"
import { existsInEnv, setValue } from "./lib/set"
import { syncDotenv } from "./lib/sync"

program
  .name("setup-dotenv")
  .description("A CLI tool for setting up and managing .env files")
  .version(version)
  .addHelpText(
    "after",
    `
Example:
  $ setup-dotenv sync                                         Copy .env.example to .env
  $ setup-dotenv sync --resolve-op                            Resolve op:// references via 1Password
  $ setup-dotenv set AUTH_SECRET $(openssl rand -base64 32)   Set a value if not already present`
  )

program
  .command("sync")
  .description("Sync environment variables from template to .env file")
  .option("-t, --target <path>", "target .env file (destination)", ".env")
  .option(
    "-s, --source <path>",
    "source file to sync from (e.g., .env.example)",
    ".env.example"
  )
  .option("--dry-run", "show what would be copied without making changes")
  .option(
    "--no-overwrite-empty-values",
    "don't overwrite empty values in target file (default: overwrite)"
  )
  .option(
    "--skip-empty-source-values",
    "skip variables with empty values in source file (default: include)"
  )
  .option(
    "--resolve-op",
    "resolve op:// references in source file via the 1Password CLI (requires `op` on PATH)"
  )
  .option(
    "--refresh-op",
    "re-resolve op:// references, overwriting existing values in target (implies --resolve-op)"
  )
  .action(
    (options: {
      target: string
      source: string
      dryRun?: boolean
      overwriteEmptyValues?: boolean
      skipEmptySourceValues?: boolean
      resolveOp?: boolean
      refreshOp?: boolean
    }) => {
      try {
        const resolveOp = options.resolveOp || options.refreshOp
        const result = syncDotenv({
          envPath: options.target,
          templatePath: options.source,
          dryRun: options.dryRun,
          overwriteEmptyValues: options.overwriteEmptyValues,
          skipEmptySourceValues: options.skipEmptySourceValues,
          resolveOp,
          refreshOp: options.refreshOp
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
              `[DRY RUN] Would update ${result.missingCount} variable(s) in ${options.target}:`
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
            `Updated ${result.missingCount} variable(s) in ${options.target}`
          )
        }
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error)
        process.exit(1)
      }
    }
  )

// Set command
program
  .command("set")
  .description("Set a single environment variable if not already present")
  .argument("<key>", "variable name to set")
  .argument("<value>", "value to assign")
  .option("-t, --target <path>", "target .env file", ".env")
  .option("-f, --force", "overwrite existing value")
  .option("--dry-run", "show what would happen without making changes")
  .action(
    (
      key: string,
      value: string,
      options: {
        target: string
        dryRun?: boolean
        force?: boolean
      }
    ) => {
      try {
        const isOpRef = value.startsWith("op://")

        // Skip 1Password auth when the key already exists and won't be
        // overwritten. This avoids an unnecessary fingerprint prompt.
        if (isOpRef && !options.force && existsInEnv(options.target, key)) {
          if (options.dryRun) {
            console.log(
              `[DRY RUN] ${key} already exists in ${options.target} – skipping (use --force to overwrite)`
            )
          } else {
            console.log(
              `${key} already exists in ${options.target} – skipping (use --force to overwrite)`
            )
          }
          return
        }

        const resolvedValue = isOpRef
          ? options.dryRun
            ? maskOpReferences(value)
            : spawnOpRead(value)
          : value

        const result = setValue({
          envPath: options.target,
          key,
          value: resolvedValue,
          dryRun: options.dryRun,
          force: options.force
        })

        const prefix = options.dryRun ? "[DRY RUN] " : ""
        const messages: Record<typeof result.status, string> = options.dryRun
          ? {
              created: `Would create ${options.target} with ${key}`,
              appended: `Would set ${key} in ${options.target}`,
              overwrote: `Would overwrite ${key} in ${options.target}`,
              skipped: `${key} already exists in ${options.target} – skipping (use --force to overwrite)`
            }
          : {
              created: `Created ${options.target} with ${key}`,
              appended: `Set ${key} in ${options.target}`,
              overwrote: `Overwrote ${key} in ${options.target}`,
              skipped: `${key} already exists in ${options.target} – skipping (use --force to overwrite)`
            }
        console.log(`${prefix}${messages[result.status]}`)
      } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error)
        process.exit(1)
      }
    }
  )

program.parse()
