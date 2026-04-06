# Changelog

## Unreleased

Nothing yet.

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
