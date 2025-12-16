---
"@evolution-sdk/devnet": patch
"@evolution-sdk/evolution": patch
---

### Core Module Enhancements

**Mint Module**
- Added `Mint.getByHex()` and `Mint.getAssetsByPolicyHex()` utilities for hex-based lookups
- Fixed `Mint.insert`, `removePolicy`, `removeAsset`, and `get` to use content-based equality (`Equal.equals`) instead of reference equality for PolicyId/AssetName lookups

**Fee Calculation**
- Fixed `calculateFeeIteratively` to include mint field in fee calculation via TxContext access
- Removed unnecessary 5000n fee buffer that caused fee overpayment

**Transaction Builder**
- Added `.mint()` method to TransactionBuilder for native token minting/burning
- `.attachScript()` now accepts `{ script: CoreScript }` parameter format
- Improved type safety by using Core types directly instead of SDK wrappers

### Devnet Package

**Test Infrastructure**
- Added `TxBuilder.Mint.test.ts` with devnet submit tests for minting and burning
- Updated `TxBuilder.Scripts.test.ts` to use Core types (`PlutusV2.PlutusV2`) instead of SDK format
- Refactored `createCoreTestUtxo` helper to accept Core `Script` types directly
- Removed unused `createTestUtxo` (SDK format) helper
- Added `Genesis.calculateUtxosFromConfig()` for retrieving initial UTxOs from genesis config
- Replaced all `Buffer.from().toString("hex")` with `Text.toHex()` in tests

### Breaking Changes
- `attachScript()` now requires `{ script: ... }` object format instead of passing script directly
- Test helpers now use Core types exclusively
