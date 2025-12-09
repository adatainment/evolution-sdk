---
"@evolution-sdk/evolution": minor
---

Add CIP-30 message signing support with modular architecture

This release introduces comprehensive CIP-30 `signData` and `verifyData` support, implementing the complete COSE Sign1 specification with a clean, modular structure:

**New Features:**
- Full CIP-30 message signing (`signData`) and verification (`verifyData`) implementation
- COSE (CBOR Object Signing and Encryption) primitives per RFC 8152
- Support for Ed25519 signatures with proper COSE key structures
- Message hashing with BLAKE2b-256 for payload integrity
- CIP-8 compliant address field handling
- Complete test coverage with CSL compatibility tests

**Module Structure:**
- `message-signing/SignData.ts` - Main CIP-30 signData/verifyData API
- `message-signing/Header.ts` - COSE header structures and operations
- `message-signing/Label.ts` - COSE label types and algorithm identifiers
- `message-signing/CoseSign1.ts` - COSE_Sign1 structure implementation
- `message-signing/CoseKey.ts` - COSE key format support
- `message-signing/Ed25519Key.ts` - Ed25519 key operations
- `message-signing/Utils.ts` - Encoding and conversion utilities

**Breaking Changes:**
- Refactored `Bytes` module API:
  - Renamed `bytesEquals` to `equals` with stricter type signature (no longer accepts undefined)
  - Removed `Bytes.FromHex` schema in favor of Effect's built-in `Schema.Uint8ArrayFromHex`
  - Updated `fromHex`/`toHex` to use Effect's native schemas

**Internal Improvements:**
- Removed unused `Bytes` imports across 32 files
- Updated all modules to use new Bytes API
- Improved CBOR encoding/decoding with proper codec options
- Enhanced type safety with Effect Schema compositions
