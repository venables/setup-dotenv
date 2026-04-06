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

# Sync only specific variables
setup-dotenv sync --only API_KEY DB_URL

# Don't overwrite existing empty values in target file
setup-dotenv sync --no-overwrite-empty-values

# Skip variables with empty values in source file
setup-dotenv sync --skip-empty-source-values

# Combine both flags
setup-dotenv sync --no-overwrite-empty-values --skip-empty-source-values

# Generate random values for variables
setup-dotenv secret AUTH_SECRET JWT_SECRET SESSION_KEY

# Generate to a specific file
setup-dotenv secret AUTH_SECRET --target .env.local

# Generate with custom length (in bytes)
setup-dotenv secret AUTH_SECRET --length 16

# Force overwrite existing values
setup-dotenv secret AUTH_SECRET --force

# Use short flags
setup-dotenv secret AUTH_SECRET -t .env.local -l 16 -f

# Dry run to see what would happen
setup-dotenv sync --dry-run
setup-dotenv secret AUTH_SECRET --dry-run
```

## Architecture

This is a TypeScript CLI toolkit that provides commands for managing environment
variables and dotenv files. It can sync variables between template files (like
`.env.example`) and actual environment files (like `.env`), as well as generate
random values for secrets.

### Core Components

**Entry Point (`src/index.ts`)**

- CLI interface using Commander.js with subcommands
- **`sync` command**: Syncs environment variables from template to .env file
  - Options: `--target`, `--source`, `--only`, `--dry-run`,
    `--no-overwrite-empty-values`, `--skip-empty-source-values`
  - By default, overwrites empty string values in target file when source has
    non-empty values
  - Use `--no-overwrite-empty-values` to preserve existing empty values in
    target file
  - Use `--skip-empty-source-values` to exclude variables with empty values from
    source file
- **`secret` command**: Generates random hex values for specific environment
  variables
  - Arguments: variable names to generate
  - Options: `--target`, `--length`, `--force`, `--dry-run`
- Handles output formatting for different modes (normal vs dry-run)
- Safe by default: won't overwrite existing values unless `--force` is used
- Error handling and process exit codes

**Core Logic**

**`src/lib/common.ts`** - Shared utilities and types:

- `generateRandomHex()` - Creates 64-character random hex values using Node.js
  crypto
- `getValueForKey()` - Gets variable value from template
- `SyncOptions`, `GenerateOptions`, and `SetupResult` interfaces

**`src/lib/sync.ts`** - Sync command logic:

- `syncDotenv()` - Main sync function with two operation modes:
  1. **Bootstrap mode**: Creates new .env file when none exists
  2. **Sync mode**: Appends missing variables to existing .env file and
     optionally overwrites empty values
- `getKeysToProcess()` - Filters variables based on --only option and
  --skip-empty-source-values flag
- `bootstrapEnvFile()` - Creates new .env files
- `appendMissingVariables()` - Adds missing vars to existing files
- **Empty value handling**: By default overwrites empty string values ("") in
  target when source has non-empty values
- **Source filtering**: Can skip variables with empty values in source file when
  --skip-empty-source-values is enabled

**`src/lib/secret.ts`** - Secret command logic:

- `generateVariables()` - Generate random hex values for specified variables
  with smart existing value handling (supports custom length parameter)
- Checks existing .env files and skips variables that already exist (unless
  `--force` is used)
- Force mode removes existing values and replaces them with newly generated ones
- Handles both new file creation and appending to existing files

All modules use `dotenv` package for parsing environment files and Node.js
`crypto.randomBytes()` for secure random generation.

### Key Design Patterns

- **Early returns** in helper functions to reduce nesting
- **Functional decomposition** - each helper does one thing
- **Dry-run support** - all file operations respect the dryRun flag
- **Variable filtering** - `--only` option works in both bootstrap and sync
  modes
- **Clean separation** - `sync` only handles template copying, `secret` only
  handles random value creation
- **Independent commands** - each command has a single, clear responsibility

### Test Conventions

- Test descriptions use assertive language: "handles X" not "should handle X"
- **`sync.test.ts`** - Tests sync functionality covering both bootstrap and sync
  modes, variable filtering (`--only`), and dry-run scenarios
- **`secret.test.ts`** - Tests secret command functionality including file
  creation, appending, length parameter, and dry-run mode
- Tests verify random hex generation produces 64-character values
- Comprehensive dry-run testing ensures no file modifications
- Tests clean up temporary files in beforeEach/afterEach hooks

### Build & Distribution

- Uses `tsdown` for TypeScript compilation
- Publishes as CLI tool via `bin` field in package.json
- ES modules (`"type": "module"`)
- Includes type definitions for TypeScript consumers
