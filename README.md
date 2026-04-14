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
setup-dotenv sync --resolve-op                           # resolve op:// refs via 1Password CLI
setup-dotenv sync --dry-run                              # preview changes
```

| Flag                          | Description                       | Default        |
| ----------------------------- | --------------------------------- | -------------- |
| `-s, --source <path>`         | Source template file              | `.env.example` |
| `-t, --target <path>`         | Target env file                   | `.env`         |
| `--only <vars...>`            | Only sync these variables         | all            |
| `--no-overwrite-empty-values` | Keep empty values in target       | overwrite      |
| `--skip-empty-source-values`  | Skip empty values in source       | include        |
| `--resolve-op`                | Resolve `op://` refs via `op` CLI |                |
| `--dry-run`                   | Preview without writing           |                |

#### `--resolve-op` (1Password CLI)

When set, `sync` pipes the template through
[`op inject`](https://developer.1password.com/docs/cli/reference/commands/inject/)
before syncing, so
[1Password secret references](https://developer.1password.com/docs/cli/secret-references/)
like `op://vault/item/field` in your `.env.example` are resolved into real
secrets in `.env`. Requires the
[1Password CLI (`op`)](https://developer.1password.com/docs/cli) on your PATH
and an authenticated session.

```bash
# .env.example
DATABASE_URL="postgres://localhost/mydb"
API_KEY="op://Shared/MyApp/api-key"
JWT_SECRET="op://Shared/MyApp/jwt-secret"
```

```bash
setup-dotenv sync --resolve-op
# DATABASE_URL="postgres://localhost/mydb"
# API_KEY="the-actual-api-key"
# JWT_SECRET="the-actual-jwt-secret"
```

- **Opt-in.** Templates without any `op://` refs are a no-op even when the flag
  is set — safe to alias as a default.
- **No temp files.** Content streams through `op inject` via stdin/stdout;
  resolved secrets never touch disk except as the final `.env` write.
- **Dry-run masks values.** `sync --resolve-op --dry-run` shows
  `<resolved from op://...>` so previews never leak plaintext secrets to the
  terminal, shell history, or CI logs.
- **Merge-preserving.** Like regular `sync`, existing values in `.env` are kept.
  Only missing keys are added, so this is the right tool when a teammate adds a
  new `op://` key to the template and you want to pull in just that one without
  losing your local edits.
- **Quoting required.** `op://` refs must be surrounded by `"` or `'` in the
  template. Unquoted refs are rejected with a clear error — this prevents
  `dotenv`'s `#`-comment parsing from silently truncating any resolved value
  containing a `#`.

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
