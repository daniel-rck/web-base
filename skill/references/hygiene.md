# Repo hygiene reference

The `hygiene` template ships repo-hygiene files. Run it on every app.

```bash
bunx github:daniel-rck/web-base add hygiene
```

It writes:

- `LICENSE` (MIT, current year, `daniel-rck` as copyright holder)
- `CONTRIBUTING.md` (branch strategy, commit conventions, PR checklist)
- `SECURITY.md` (GitHub Security Advisories disclosure path)
- `.editorconfig` (2-space indent, LF, trim trailing whitespace except Markdown)

## LICENSE

MIT. Sub-dependencies must be MIT, Apache-2.0, BSD, or ISC. AGPL-3.0 and
other copyleft licenses are excluded.

When the year rolls over, update the copyright line via a PR to `web-base`'s
`cli/templates/hygiene/LICENSE` and run `bunx ... update hygiene --apply` in
each app.

## CONTRIBUTING.md

Standard conventions:

- `main` is the deployed branch.
- Feature work on short-lived branches (`feat/...`, `fix/...`).
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`,
  `test:`).
- PR checklist: lint, typecheck, tests, German UI strings, no unjustified
  new dependencies.

## SECURITY.md

Reports go through **GitHub Security Advisories** (not public issues, not
email). Aim to acknowledge within 7 days and remediate within 30.

Scope explicitly notes the local-first + DSGVO-konform architecture so
researchers know what's in scope (sync crypto, XSS, worker endpoints,
SW cache poisoning).

## package.json metadata

Every app's `package.json` carries the metadata fields documented in
`tech-stack.md`:

- `keywords`, `author: "daniel-rck"`, `license: "MIT"`
- `homepage: "https://<app>.daniel-rck.workers.dev"`
- `repository`, `bugs` pointing at `github.com/daniel-rck/<App>`
- `packageManager: "bun@1.3.11"`

The `init` command generates this shape automatically.

## .editorconfig

```
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

Note: the template ships the file as `editorconfig` (no leading dot) and
the CLI writes it to `.editorconfig` at the destination. This sidesteps
file-listing tools that hide dotfiles.
