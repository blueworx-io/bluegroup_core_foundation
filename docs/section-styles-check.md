# Section styles check

Fails a pull request when a section types in its own colour, font or size
instead of using the theme's named styles, so design and code can't drift apart.

- Script: `scripts/check-section-styles.mjs` (logic in `scripts/lib/section-styles.mjs`).
- It reads CSS and SCSS (including nested properties) and the markup `render.php` prints, and judges the stylesheets (`.css`, `.scss`) and `render.php` files under a `blocks/` folder.
  On a pull request, only the ones the pull request changes.
- **Fails:** a hex, `rgb()`/`hsl()`/`oklch()` or named colour; a `font-family` or `font`
  that is not a `--font-*` name; a `font-size` that is not a `--text-*` name (a `calc()` of
  them is fine); a section defining `--color-*`, `--font-*` or `--text-*` itself.
- **Passes:** `var(--color-primary)` and friends, `transparent`, `currentColor`, `inherit`.
  A fallback inside the `var()` of a theme name (`var(--color-surface, #f4f6fa)`) is left alone; a
  fallback on any other variable is judged.
- The old BlueWorx plugin's one file of theme names is allowed: it sits outside `blocks/`,
  or set `SECTION_NAMES_FILE` to its path.
- `SECTION_STYLES=warn` reports without failing; `off` skips it.
- Run it by hand from the plugin or theme root: `node ../bluegroup_core_foundation/scripts/check-section-styles.mjs`.

## Wiring it into `ci-wordpress.yml`

Add beside the "Admin UI adherence" step:

```yaml
      - name: Section styles (theme names only)
        env:
          SECTION_STYLES: ${{ inputs.section_styles }}
          SECTION_NAMES_FILE: ${{ inputs.section_names_file }}
          BASE_REF: ${{ github.base_ref }}
        run: node "$RUNNER_TEMP/foundation/scripts/check-section-styles.mjs"
```

with two inputs under `workflow_call.inputs`: `section_styles` (string, default `error`)
and `section_names_file` (string, default empty).
