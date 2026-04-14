# Changelog

## Unreleased

- Fix `sync --resolve-op` failing with `expected data on stdin but none found`
  on recent versions of the 1Password CLI. `op inject` is now invoked with
  `-i <tmpfile>` (written to a private temp directory and cleaned up after the
  call) instead of receiving the template via a Node-supplied stdin pipe.
- Fix `sync` leaving duplicate key lines behind when overwriting empty values.
  The original empty line is now replaced in place rather than having the new
  `KEY="value"` appended at the bottom of the file. All forms that
  `dotenv.parse` treats as empty are recognised, including: `KEY=`, `KEY=""`,
  `KEY=''`, `KEY= # comment`, `KEY="" # comment`, `export KEY=`, and
  whitespace/multi-space variations. Existing `export` prefixes, indentation,
  trailing comments, ordering, and non-matching lines are preserved. If a line
  still somehow cannot be matched, `sync` now emits a loud warning before
  appending rather than silently creating a duplicate. Output message wording
  updated from "Appended" to "Updated" to reflect that changes may be in-place
  rewrites rather than appends.

## 3.0.0

**Breaking changes**

- Remove the `--only <vars...>` flag from `sync`. The common case it covered
  ("add just this new key from the template") is already handled by plain
  `sync`, which only adds missing keys. For one-off subset bootstrap, edit the
  resulting `.env` after the fact.

**New features**

- Add `--resolve-op` flag to `sync` that pipes the template through the
  1Password CLI's `op inject` before syncing. Opt-in, streams via stdin/stdout
  (no temp files), preserves template comments and formatting, and masks values
  in dry-run so previews never leak plaintext secrets. Templates without any
  `op://` references are a no-op even when the flag is set, so it is safe to
  alias as a default. `op://` references must be quoted in the template —
  unquoted refs are rejected with a clear error to prevent `dotenv`'s
  `#`-comment parsing from silently truncating resolved values.

## 2.0.1

- Bump dependencies (commander 14.0.3, dotenv 17.4.1, tsdown 0.21, typescript 6)
- Rewrite README to be minimal and value-first
- Add AGENTS.md for AI coding assistants
- Update license year

## 2.0.0

**Breaking changes**

- Renamed package from `dotkit` to `setup-dotenv`
- `secret` command now generates base64url values by default (previously hex)

**New features**

- `--hex` flag on `secret` to opt into hex encoding
- `setup-dotenv secret` with no arguments prints a raw secret to stdout
- Help screen now includes usage examples

**Tooling**

- Replaced biome with oxlint and oxfmt
