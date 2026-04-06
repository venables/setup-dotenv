# setup-dotenv

A powerful CLI toolkit for managing environment variables and dotenv files.

## Features

- **Sync** environment variables from template files (like `.env.example`) to
  your `.env` files
- **Secret** generation of random hex values for secrets and authentication
  tokens
- **Smart filtering** with `--only` to sync specific variables
- **Custom length** generation with `--length` parameter
- **Force overwrite** existing values with `-f/--force` when generating
- **Safe by default** - won't overwrite existing values unless forced
- **Dry-run support** to preview exact changes before applying them
- **Bootstrap mode** to create new `.env` files from templates
- **Value quoting** - new values are automatically quoted for consistency

## Installation

```bash
npm install -g setup-dotenv
```

## Usage

### Sync Command

Sync environment variables from a template file to your `.env` file:

```bash
# Basic sync from .env.example to .env
setup-dotenv sync

# Sync with custom paths
setup-dotenv sync --source .env.local.example --target .env.local

# Sync only specific variables
setup-dotenv sync --only API_KEY DB_URL

# Preview changes with exact values
setup-dotenv sync --dry-run
```

### Secret Command

Generate random hex values for environment variables:

```bash
# Generate random values for multiple variables
setup-dotenv secret AUTH_SECRET JWT_SECRET SESSION_KEY

# Generate with custom length (in bytes)
setup-dotenv secret AUTH_SECRET --length 16

# Generate to a specific file
setup-dotenv secret AUTH_SECRET --target .env.local

# Preview what would be generated with sample values
setup-dotenv secret AUTH_SECRET --dry-run

# Force overwrite existing values
setup-dotenv secret AUTH_SECRET --force

# Use short flags
setup-dotenv secret AUTH_SECRET -t .env.local -l 16 -f

```

## Options

### Sync Command Options

- `-t, --target <path>` - Target .env file (default: `.env`)
- `-s, --source <path>` - Source template file (default: `.env.example`)
- `--only <variables...>` - Only sync these specific variables
- `--dry-run` - Show what would be copied without making changes

### Secret Command Options

- `-t, --target <path>` - Target .env file (default: `.env`)
- `-l, --length <bytes>` - Length in bytes for generated values (default: `32`)
- `-f, --force` - Overwrite existing values (default: skip existing)
- `--dry-run` - Show what would be generated without making changes

## Examples

### Basic Workflow

1. **Create a template file** (`.env.example`):

```env
API_KEY=your_api_key_here
DB_URL=postgres://localhost:5432/myapp
AUTH_SECRET=replace_with_random_value
JWT_SECRET=replace_with_random_value
```

2. **Bootstrap your .env file**:

```bash
# First sync template values (preserves original format)
setup-dotenv sync

# Then generate secrets separately
setup-dotenv secret AUTH_SECRET JWT_SECRET
```

This creates `.env` with:

```env
API_KEY=your_api_key_here
DB_URL=postgres://localhost:5432/myapp
AUTH_SECRET=replace_with_random_value
JWT_SECRET=replace_with_random_value

AUTH_SECRET="a1b2c3d4e5f6789..."
JWT_SECRET="9f8e7d6c5b4a321..."
```

### Dry-Run Examples

Preview exact changes before applying:

```bash
# See what sync would copy
setup-dotenv sync --dry-run
# Output:
# [DRY RUN] Would copy these variables:
#   API_KEY="your_api_key_here"
#   DB_URL="postgres://localhost:5432/myapp"

# See what secret would create
setup-dotenv secret AUTH_SECRET --dry-run
# Output:
# [DRY RUN] Would generate values for:
#   AUTH_SECRET="d805b72dcf114e7f05fce56ede679cdbd71655de2066582ce21e53e9f0ad84b2"
```

### Custom Length Generation

```bash
# Generate 16-byte (32 hex characters) values
setup-dotenv secret SHORT_SECRET --length 16

# Generate 64-byte (128 hex characters) values
setup-dotenv secret LONG_SECRET --length 64

# Default is 32 bytes (64 hex characters)
setup-dotenv secret DEFAULT_SECRET
```

### Adding New Variables

Add new variables to your `.env.example`:

```env
API_KEY=your_api_key_here
DB_URL=postgres://localhost:5432/myapp
NEW_FEATURE_FLAG=false
```

Sync only the new variable:

```bash
setup-dotenv sync --only NEW_FEATURE_FLAG
# Creates: NEW_FEATURE_FLAG="false"
```

### Force Overwriting Existing Values

By default, `setup-dotenv secret` skips variables that already exist:

```bash
# .env already contains AUTH_SECRET=old_value
setup-dotenv secret AUTH_SECRET NEW_SECRET
# Result: Skips AUTH_SECRET, only generates NEW_SECRET
# Output: "Already exist (skipped): AUTH_SECRET"
```

Use `--force` to overwrite existing values:

```bash
setup-dotenv secret AUTH_SECRET NEW_SECRET --force
# Result: Overwrites AUTH_SECRET with new random value, generates NEW_SECRET
```

## How It Works

### Bootstrap Mode

When your `.env` file doesn't exist, `setup-dotenv sync` creates it from your
template file, preserving the original formatting. Use `--only` to filter which
variables to include.

### Sync Mode

When your `.env` file exists, `setup-dotenv sync` appends missing variables from
the template with quoted values. Existing variables are never modified.

### Secret Mode

`setup-dotenv secret` creates cryptographically secure random hex values. It
works independently of templates and can create new files or append to existing
ones.

By default, it **skips variables that already exist** in the target file. Use
`-f` or `--force` to overwrite existing values.

### Random Value Generation

Generated values are hexadecimal strings created using Node.js
`crypto.randomBytes()` for cryptographic security. Default length is 32 bytes
(64 hex characters).

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build
bun build

# Run all checks (format, lint, typecheck)
bun check

# Auto-fix issues
bun fix
```

## License

MIT
