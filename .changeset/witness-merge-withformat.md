---
"@evolution-sdk/evolution": patch
---

`addVKeyWitnessesBytes` now uses the WithFormat round-trip to merge witnesses, preserving original CBOR encoding rather than performing manual byte surgery.
