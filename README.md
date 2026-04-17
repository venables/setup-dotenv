# setup-dotenv

Sync `.env.example` to `.env` and set individual variables -- so new
contributors can get running in seconds.

## Install

```bash
npm install -g setup-dotenv
```

## Quick Start

```bash
# Copy .env.example to .env (won't overwrite existing values)
setup-dotenv sync

# Set a secret if not already present
setup-dotenv set AUTH_SECRET $(openssl rand -base64 32)

# Resolve op:// references via the 1Password CLI
setup-dotenv sync --resolve-op
```

## Commands

### `sync`

Copies missing variables from a template file to your `.env`.

```bash
setup-dotenv sync                                        # .env.example -> .env
setup-dotenv sync -s .env.local.example -t .env.local    # custom paths
setup-dotenv sync --resolve-op                           # resolve op:// refs via 1Password CLI
setup-dotenv sync --refresh-op                           # re-resolve op:// refs, overwriting existing values
setup-dotenv sync --dry-run                              # preview changes
```

| Flag                          | Description                                          | Default        |
| ----------------------------- | ---------------------------------------------------- | -------------- |
| `-s, --source <path>`         | Source template file                                 | `.env.example` |
| `-t, --target <path>`         | Target env file                                      | `.env`         |
| `--no-overwrite-empty-values` | Keep empty values in target                          | overwrite      |
| `--skip-empty-source-values`  | Skip empty values in source                          | include        |
| `--resolve-op`                | Resolve `op://` refs via `op` CLI                    |                |
| `--refresh-op`                | Re-resolve `op://` refs, overwriting existing values |                |
| `--dry-run`                   | Preview without writing                              |                |

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
  is set -- safe to alias as a default.
- **Dry-run masks values.** `sync --resolve-op --dry-run` shows
  `<resolved from op://...>` so previews never leak plaintext secrets to the
  terminal, shell history, or CI logs.
- **Merge-preserving.** Like regular `sync`, existing values in `.env` are kept.
  Only missing keys are added, so this is the right tool when a teammate adds a
  new `op://` key to the template and you want to pull in just that one without
  losing your local edits.
- **Quoting required.** `op://` refs must be surrounded by `"` or `'` in the
  template. Unquoted refs are rejected with a clear error -- this prevents
  `dotenv`'s `#`-comment parsing from silently truncating any resolved value
  containing a `#`.

#### `--refresh-op` (force re-resolution)

When a 1Password secret has rotated, your local `.env` goes stale: the resolved
value from an earlier `sync` is a normal non-empty value, so regular
`sync --resolve-op` won't touch it. `--refresh-op` force-overwrites any key
whose raw template value is an `op://` reference, re-resolving it from
1Password.

```bash
setup-dotenv sync --refresh-op
```

- **Implies `--resolve-op`.** You don't need to pass both.
- **Only touches `op://` keys.** Non-op keys keep their existing values.
- **Will trigger a 1Password auth prompt** (fingerprint / password) if your
  session isn't active.

### `set`

Sets a single environment variable if not already present. The value can come
from any source -- shell commands, literals, or 1Password `op://` references.

```bash
setup-dotenv set AUTH_SECRET $(openssl rand -base64 32)    # set if missing
setup-dotenv set AUTH_SECRET $(openssl rand -base64 32) -f # overwrite existing
setup-dotenv set DB_URL postgres://localhost/mydb           # any value source
setup-dotenv set DB_URL op://vault/db/url                   # resolve from 1Password
setup-dotenv set AUTH_SECRET "my-value" -t .env.local       # custom target
setup-dotenv set AUTH_SECRET "my-value" --dry-run           # preview
```

| Flag                  | Description               | Default |
| --------------------- | ------------------------- | ------- |
| `-t, --target <path>` | Target env file           | `.env`  |
| `-f, --force`         | Overwrite existing values | skip    |
| `--dry-run`           | Preview without writing   |         |

Safe by default: if the key already exists (with any value, including empty),
`set` skips it and logs a message. Use `--force` to overwrite.

#### `op://` references

When the value starts with `op://`, it's resolved via
[`op read`](https://developer.1password.com/docs/cli/reference/commands/read/)
before writing. The 1Password auth prompt is skipped entirely when the key
already exists and `--force` isn't set.

## Typical Workflow

Given a `.env.example`:

```env
API_KEY=your_api_key_here
DB_URL=postgres://localhost:5432/myapp
AUTH_SECRET=
JWT_SECRET=
```

```bash
setup-dotenv sync
setup-dotenv set AUTH_SECRET $(openssl rand -base64 32)
setup-dotenv set JWT_SECRET $(openssl rand -base64 32)
```

## License

MIT
