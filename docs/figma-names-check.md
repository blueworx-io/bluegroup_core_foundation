# Figma names check

Checks that a client's Figma file uses exactly the theme's colour, font, size, space
and corner names, before build starts. It lists every mismatch; a correct file passes.

- Script: `scripts/check-figma-names.mjs` (logic in `scripts/lib/figma-names.mjs`).
- The rule it enforces is "Client Figma files" in `CLAUDE.md.template`: `color/primary` in
  Figma is `--color-primary` in the theme, `space/4` is `--space-4`.
- **The theme's names** are the `--color-*`, `--font-*`, `--text-*` (sizes), `--space-*` and
  `--radius-*` (corners) it defines in its `.css` / `.scss` files.
- **Missing:** the theme has the name, the Figma file does not.
- **Extra:** the Figma file has a variable the theme has no name for.
- **Misnamed:** the Figma name is nearly right (`Color/Primary`, `colour/primary`,
  `color-primary`, `color/primaryDark`, `spacing/4`). The report says what to rename it to.
- A name that is not spelled exactly (a trailing space included) is misnamed, never trimmed.
- `--collection` includes the variables an extended collection inherits.
- `color/text/muted` and `color/text-muted` both mean `--color-text-muted`, so either passes.
- It fails if the Figma file has no variables, or the theme has no names — never a quiet pass.

## Running it

Export the file's variables, then, from the theme's folder:

```
node ../bluegroup_core_foundation/scripts/check-figma-names.mjs --figma variables.json --theme .
```

`--figma` takes a file of Figma variables: a plain list of names, a tokens file with the
groups nested (`{ "color": { "primary": { "$value": "#0a4ea3" } } }`), or Figma's own
"local variables" answer. Repeat it for several files. `--theme` takes the theme's folder
(or one stylesheet); repeat it for several.

To read the variables straight from Figma instead, give a file key or link and a token:

```
FIGMA_TOKEN=... node ../bluegroup_core_foundation/scripts/check-figma-names.mjs --figma-file <key or link> --theme .
```

Figma only shares variables this way on an Enterprise plan, with a token that has the
`file_variables:read` permission. Without one, export the variables to a file. The token
is read from the environment and never printed.

`--collection "Design system"` checks one variable collection only (only for Figma's own
answer). `FIGMA_NAMES=warn` reports without failing; `off` skips.
Exit codes: 0 names match, 1 mismatch, 2 could not read something.
