---
"@evolution-sdk/evolution": patch
---

Add `attachMetadata()` operation to TransactionBuilder for attaching transaction metadata according to CIP-10 standard.

**Changes:**
- Added `attachMetadata()` method to attach metadata with custom labels
- Metadata labels are now bigint (unbounded positive integers) supporting CIP-20 messages (label 674) and custom labels
- Automatic computation of auxiliaryDataHash in transaction body when metadata is present
- Proper fee calculation accounting for auxiliary data size
- TransactionMetadatum refactored to simple union type: `string | bigint | Uint8Array | Map | Array`
- Added `NonNegativeInteger` schema to Numeric module for unbounded non-negative integers

**Example:**
```typescript
await client
  .newTx()
  .attachMetadata({
    label: 674n,  // CIP-20 message label
    metadata: "Hello Cardano!"
  })
  .payToAddress({ address, assets })
  .build()
  .then(tx => tx.sign().submit())
```
