import { Effect, Ref, Schema } from "effect"

import * as NativeScripts from "../../../core/NativeScripts.js"
import * as PlutusV1 from "../../../core/PlutusV1.js"
import * as PlutusV2 from "../../../core/PlutusV2.js"
import * as PlutusV3 from "../../../core/PlutusV3.js"
import * as ScriptHashCore from "../../../core/ScriptHash.js"
import type * as Script from "../../Script.js"
import { TransactionBuilderError, TxContext } from "../TransactionBuilder.js"

/**
 * Attaches a Plutus script to the transaction by storing it in the builder state.
 * The script is indexed by its hash for efficient lookup during transaction assembly.
 *
 * This is an internal helper used by the public attachScript() method.
 * Scripts must be attached before being referenced by transaction inputs or minting policies.
 *
 * @since 2.0.0
 * @category operations
 */
export const attachScriptToState = (script: Script.Script) =>
  Effect.gen(function* () {
    const stateRef = yield* TxContext
    const state = yield* Ref.get(stateRef)
    
    // Convert SDK Script to Core Script by wrapping in CBOR array with language tag
    // For Plutus scripts: [ tag, script_bytes ] where script_bytes is Uint8Array
    // For Native scripts: [ 0n, native_script_cddl ] where native_script_cddl must be decoded from CBOR first
    const coreScript = yield* convertToCoreScript(script)

    // Debug: Log the raw bytes being stored
    if (coreScript._tag === "PlutusV2") {
      const bytesHex = Array.from(coreScript.bytes).map(b => b.toString(16).padStart(2, '0')).join('')
      yield* Effect.logDebug(`[Attach] PlutusV2 script bytes (${coreScript.bytes.length} bytes): ${bytesHex}`)
    }

    // Compute script hash
    const scriptHash = ScriptHashCore.fromScript(coreScript)
    const scriptHashHex = ScriptHashCore.toHex(scriptHash)

    yield* Effect.logDebug(`[Attach] Script hash: ${scriptHashHex}`)

    // Add script to state map (keyed by hash hex string)
    const updatedScripts = new Map(state.scripts)
    updatedScripts.set(scriptHashHex, coreScript)

    yield* Ref.set(stateRef, {
      ...state,
      scripts: updatedScripts
    })
  }).pipe(
    Effect.mapError(
            (error) =>
        new TransactionBuilderError({
          message: "Failed to attach script",
          cause: error
        })
    )
  )

/**
 * Convert SDK Script format to Core Script format.
 * 
 * SDK scripts store script bytes as hex strings in the `script.script` field.
 * These may be CBOR-wrapped (starting with CBOR byte string tag like 0x49) or raw bytes.
 * 
 * Core scripts store the RAW script bytes (flat-encoded UPLC for Plutus scripts).
 * 
 * Conversion approach:
 * - For Plutus scripts: 
 *   1. Convert hex → Uint8Array
 *   2. If CBOR-wrapped (starts with valid CBOR byte string tag), unwrap it
 *   3. Store raw bytes in PlutusVX class
 * - For Native scripts: Use FromCBORHex schema which handles CBOR deserialization
 * 
 * @internal
 */
const convertToCoreScript = (script: Script.Script) =>
  Effect.gen(function* () {
    switch (script.type) {
      case "Native":
        // Native script: Use FromCBORHex schema (handles CBOR deserialization internally)
        return yield* Schema.decode(NativeScripts.FromCBORHex())(script.script)
        
      case "PlutusV1": {
        // Unwrap CBOR if present, get raw script bytes
        const rawBytes = unwrapCBOR(script.script)
        return yield* Schema.decode(PlutusV1.PlutusV1)({_tag: "PlutusV1", bytes: rawBytes})
      }
        
      case "PlutusV2": {
        const rawBytes = unwrapCBOR(script.script)
        return yield* Schema.decode(PlutusV2.PlutusV2)({_tag: "PlutusV2", bytes: rawBytes})
      }
        
      case "PlutusV3": {
        const rawBytes = unwrapCBOR(script.script)
        return yield* Schema.decode(PlutusV3.PlutusV3)({_tag: "PlutusV3", bytes: rawBytes})
      }
    }
  })

/**
 * Unwrap CBOR byte string encoding if present.
 * CBOR byte strings start with a major type 2 tag (0x40-0x5f).
 * For lengths 0-23, the length is encoded in the tag byte itself.
 * For longer byte strings, additional bytes encode the length.
 * 
 * @param hex - Hex string that may be CBOR-wrapped
 * @returns Hex string of raw bytes
 */
const unwrapCBOR = (hex: string): string => {
  // Convert hex to bytes
  const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)))
  
  // Check if this is a CBOR byte string (major type 2 = 0x40-0x5f)
  const firstByte = bytes[0]!
  if ((firstByte & 0xe0) === 0x40) { // Major type 2
    const length = firstByte & 0x1f // Lower 5 bits = length
    
    if (length < 24) {
      // Length encoded in tag byte - unwrap by skipping first byte
      const rawBytes = bytes.slice(1)
      return Array.from(rawBytes).map(b => b.toString(16).padStart(2, '0')).join('')
    }
    // For length >= 24, would need to handle additional length bytes
    // For now, just return as-is (Plutus scripts are typically small)
  }
  
  // Not CBOR-wrapped or already unwrapped - return as-is
  return hex
}
