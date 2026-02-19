---
"@evolution-sdk/evolution": patch
---

Fix blueprint codegen ignoring constructor index for empty constructors.

`generateTypeScript` now emits `{ index: N }` for `TSchema.Literal` when the constructor index is non-zero (e.g. `Never` with `index: 1`).

Fixes #148
