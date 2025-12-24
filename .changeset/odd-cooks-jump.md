---
"@evolution-sdk/devnet": patch
"@evolution-sdk/evolution": patch
---

### TxBuilder Composition API

Add `compose()` and `getPrograms()` methods for modular transaction building:

```ts
// Create reusable builder fragments
const mintBuilder = client.newTx()
  .mintAssets({ policyId, assets: { tokenName: 1n }, redeemer })
  .attachScript({ script: mintingPolicy })

const metadataBuilder = client.newTx()
  .attachMetadata({ label: 674n, metadata: "Cross-chain tx" })

// Compose multiple builders into one transaction
const tx = await client.newTx()
  .payToAddress({ address, assets: { lovelace: 5_000_000n } })
  .compose(mintBuilder)
  .compose(metadataBuilder)
  .build()
```

**Features:**
- Merge operations from multiple builders into a single transaction
- Snapshot accumulated operations with `getPrograms()` for inspection
- Compose builders from different client instances
- Works with all builder methods (payments, validity, metadata, minting, staking, etc.)

### Fixed Validity Interval Fee Calculation Bug

Fixed bug where validity interval fields (`ttl` and `validityIntervalStart`) were not included during fee calculation, causing "insufficient fee" errors when using `setValidity()`.

**Root Cause**: Validity fields were being added during transaction assembly AFTER fee calculation completed, causing the actual transaction to be 3-8 bytes larger than estimated.

**Fix**: Convert validity Unix times to slots BEFORE the fee calculation loop and include them in the TransactionBody during size estimation.

### Error Type Corrections

Corrected error types for pure constructor functions to use `never` instead of `TransactionBuilderError`:
- `makeTxOutput` - creates TransactionOutput
- `txOutputToTransactionOutput` - creates TransactionOutput  
- `mergeAssetsIntoUTxO` - creates UTxO
- `mergeAssetsIntoOutput` - creates TransactionOutput
- `buildTransactionInputs` - creates and sorts TransactionInputs

### Error Message Improvements

Enhanced error messages throughout the builder to include underlying error details for better debugging.
