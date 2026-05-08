# Example DBF (Elecdes BOM)

Put **`NotcherXPBsum.dbf`** (or any Elecdes BOM export) in this folder **or** in:

`apps/api/test/fixtures/`

Both locations are fine for local use. Tracked `*.dbf` files are ignored by default (see repo `.gitignore`); use `git add -f path/to/small-sample.dbf` if you need a tiny fixture in git.

Import in the app: open the project → **Purchasing / PO** → **Import Elecdes BOM (.dbf)**.
