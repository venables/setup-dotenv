# setup-dotenv

This project is a CLI for making initial `.env` file setup easier, by
auto-syncing with the `.env.example` (e.g. in case new items were added), and
for making unique local-only secrets for development.

## Development Commands

Core development workflow:

```bash
# Install dependencies
bun install

# Run tests (uses vitest)
bun test

# Run single test file
bun test src/lib/sync.test.ts

# Build the CLI tool
bun build

# Run all checks (format, lint, typecheck)
bun check

# Auto-fix formatting and linting issues
bun fix

# Individual checks
bun run check-format  # Check Prettier formatting
bun run lint          # Run oxlint + publint
bun run typecheck     # TypeScript type checking
```

## Usage Examples

```bash
# Sync variables from .env.example to .env
setup-dotenv sync

# Sync with custom paths
setup-dotenv sync --source .env.local.example --target .env.local

# Don't overwrite existing empty values in target file
setup-dotenv sync --no-overwrite-empty-values

# Skip variables with empty values in source file
setup-dotenv sync --skip-empty-source-values

# Combine both flags
setup-dotenv sync --no-overwrite-empty-values --skip-empty-source-values

# Resolve op:// references via the 1Password CLI
setup-dotenv sync --resolve-op

# Re-resolve op:// references after a rotation (overwrites existing values)
setup-dotenv sync --refresh-op

# Dry run to see what would happen
setup-dotenv sync --dry-run

# Set a single variable (skips if already present)
setup-dotenv set AUTH_SECRET $(openssl rand -base64 32)

# Set from 1Password (resolved via `op read`)
setup-dotenv set DB_URL op://vault/db/url

# Force overwrite an existing value
setup-dotenv set AUTH_SECRET $(openssl rand -base64 32) --force
```

## Architecture

This is a TypeScript CLI toolkit that syncs variables from a template file (like
`.env.example`) into a target env file (like `.env`). It can optionally resolve
1Password `op://` references and set individual variables from any value source.

### Core Components

**Entry Point (`src/index.ts`)**

- CLI interface using Commander.js with two subcommands: `sync` and `set`
- **`sync` command**: Syncs environment variables from template to .env file
  - Options: `--target`, `--source`, `--dry-run`, `--no-overwrite-empty-values`,
    `--skip-empty-source-values`, `--resolve-op`, `--refresh-op`
  - By default, overwrites empty string values in target file when source has
    non-empty values
  - `--refresh-op` implies `--resolve-op`
- **`set` command**: Sets a single variable if not already present
  - Arguments: key and value
  - Options: `--target`, `--force`, `--dry-run`
  - Skips if key exists (any value, including empty) unless `--force` is used
- Handles output formatting for different modes (normal vs dry-run)
- Error handling and process exit codes

**Core Logic**

**`src/lib/common.ts`** - Shared utilities and types:

- `getValueForKey()` - Gets variable value from template
- `SyncOptions`, `SetupResult` interfaces

**`src/lib/sync.ts`** - Main sync logic:

- `syncDotenv()` - Two operation modes:
  1. **Bootstrap mode**: Creates new .env file when none exists
  2. **Sync mode**: Adds missing variables and optionally overwrites empty
     values, preserving comments and ordering via in-place line rewrites
- `resolveTemplateContent()` - Routes the template through `op inject` when
  `--resolve-op` is set (or masks values in dry-run)
- **Refresh-op path**: Captures `op://` keys from the raw template before
  resolution; after resolution, force-rewrites matching keys in-place via the
  `ANY_VALUE_LINE` regex

**`src/lib/set.ts`** - Set command logic:

- `setValue()` - Writes `KEY="VALUE"` to .env if key is not present
- `existsInEnv()` - Checks if a key exists in a .env file (used to avoid
  unnecessary 1Password auth when the key would be skipped)
- Creates the file if it doesn't exist, appends if key is missing, replaces
  in-place with `--force`

**`src/lib/op.ts`** - 1Password CLI integration:

- `hasOpReferences()` / `findUnquotedOpReferences()` / `findOpReferenceKeys()` -
  Static analysis of raw template for op:// refs
- `spawnOpInject()` - Shells out to `op inject -i <tmpfile>`; the temp file
  holds only references (pointers, not resolved secrets) and is removed
  unconditionally
- `spawnOpRead()` - Shells out to `op read` for single-value resolution (used by
  the `set` command when the value starts with `op://`)
- `classifyOpInjectError()` / `classifyOpReadError()` - Map `op` exit status +
  stderr to user-friendly messages, scrubbing any op:// refs from surfaced
  output

All modules use `dotenv` package for parsing environment files.

### Key Design Patterns

- **Early returns** in helper functions to reduce nesting
- **Functional decomposition** - each helper does one thing
- **Dry-run support** - all file operations respect the dryRun flag
- **Shared line rebuild** - both empty-value overwrite and refresh-op paths use
  the same `rebuildLine()` + capture-group layout, differing only in which regex
  they use to match the candidate line
- **Raw-then-resolved** - op:// key tracking happens on the raw template so
  refresh-op knows which keys to force-overwrite even when the target already
  has a resolved value

### Changelog

Always update `CHANGELOG.md` when making user-facing changes. Add entries under
the `## Unreleased` section. When releasing a new version, rename `Unreleased`
to the version number and add a fresh `## Unreleased` section above it.

### Test Conventions

- Test descriptions use assertive language: "handles X" not "should handle X"
- **`sync.test.ts`** - Tests sync functionality covering bootstrap, sync mode,
  empty-value handling, `--resolve-op`, `--refresh-op`, and dry-run scenarios
- **`set.test.ts`** - Tests set command: create, append, skip, force, dry-run
- **`op.test.ts`** - Tests op:// detection, key extraction, masking, and error
  classification (does not shell out to `op`)
- Comprehensive dry-run testing ensures no file modifications
- Tests clean up temporary files in beforeEach/afterEach hooks

### Build & Distribution

- Uses `tsdown` for TypeScript compilation
- Publishes as CLI tool via `bin` field in package.json
- ES modules (`"type": "module"`)
- Includes type definitions for TypeScript consumers
