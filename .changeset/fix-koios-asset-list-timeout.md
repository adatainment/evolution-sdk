---
"@evolution-sdk/evolution": patch
---

Fix `awaitTx` failing with a `ParseError` when Koios returns `asset_list` as a Haskell show-formatted string on collateral outputs. Add configurable `timeout` parameter to `awaitTx` across all providers (Koios, Blockfrost, Maestro, Kupmios).
