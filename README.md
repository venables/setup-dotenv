# setup-dotenv

Sync `.env.example` to `.env` and generate secrets -- so new contributors can
get running in seconds.

## Install

```bash
npm install -g setup-dotenv
```

## Quick Start

```bash
# Copy .env.example to .env (won't overwrite existing values)
setup-dotenv sync

# Generate random secrets
setup-dotenv secret AUTH_SECRET JWT_SECRET
```

## Commands

### `sync`

Copies missing variables from a template file to your `.env`.

```bash
setup-dotenv sync                                        # .env.example -> .env
setup-dotenv sync -s .env.local.example -t .env.local    # custom paths
setup-dotenv sync --only API_KEY DB_URL                  # specific variables
setup-dotenv sync --dry-run                              # preview changes
```

| Flag                          | Description                 | Default        |
| ----------------------------- | --------------------------- | -------------- |
| `-s, --source <path>`         | Source template file        | `.env.example` |
| `-t, --target <path>`         | Target env file             | `.env`         |
| `--only <vars...>`            | Only sync these variables   | all            |
| `--no-overwrite-empty-values` | Keep empty values in target | overwrite      |
| `--skip-empty-source-values`  | Skip empty values in source | include        |
| `--dry-run`                   | Preview without writing     |                |

### `secret`

Generates cryptographically secure random values (base64url by default).

```bash
setup-dotenv secret AUTH_SECRET JWT_SECRET    # write to .env
setup-dotenv secret AUTH_SECRET --force       # overwrite existing value
setup-dotenv secret AUTH_SECRET --hex         # hex instead of base64url
setup-dotenv secret AUTH_SECRET -l 16         # custom length (bytes)
setup-dotenv secret                           # print a raw secret to stdout
```

| Flag                   | Description                       | Default |
| ---------------------- | --------------------------------- | ------- |
| `-t, --target <path>`  | Target env file                   | `.env`  |
| `-l, --length <bytes>` | Length in bytes                   | `32`    |
| `--hex`                | Hex encoding instead of base64url |         |
| `-f, --force`          | Overwrite existing values         | skip    |
| `--dry-run`            | Preview without writing           |         |

## Typical Workflow

Given a `.env.example`:

```env
API_KEY=your_api_key_here
DB_URL=postgres://localhost:5432/myapp
AUTH_SECRET=
JWT_SECRET=
```

```bash
setup-dotenv sync                        # copies template to .env
setup-dotenv secret AUTH_SECRET JWT_SECRET  # fills in the secrets
```

## License

MIT
