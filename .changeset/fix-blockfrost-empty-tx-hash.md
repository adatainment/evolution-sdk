---
"@evolution-sdk/evolution": patch
---

Filter out UTxOs with an empty `tx_hash` in Blockfrost `getUtxos` and `getUtxosWithUnit` to prevent a `ParseError` crash when providers like Dolos return malformed entries
