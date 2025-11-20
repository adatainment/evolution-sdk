---
"@evolution-sdk/evolution": patch
---

Add Aiken-compatible CBOR encoding with encodeMapAsPairs option and comprehensive test suite. PlutusData maps can now encode as arrays of pairs (Aiken style) or CBOR maps (CML style). Includes 72 Aiken reference tests and 40 TypeScript compatibility tests verifying identical encoding. Also fixes branded schema pattern in Data.ts for cleaner type inference and updates TSchema error handling test.
