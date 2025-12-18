import type * as CoreAddress from "../../../core/Address.js"
import type * as CoreAssets from "../../../core/Assets/index.js"
import type * as CoreDatumOption from "../../../core/DatumOption.js"
import type * as CoreScriptRef from "../../../core/ScriptRef.js"
import type * as UTxO from "../../../core/UTxO.js"
import type * as RedeemerBuilder from "../RedeemerBuilder.js"

// ============================================================================
// Operation Parameter Types
// ============================================================================

export interface PayToAddressParams {
  readonly address: CoreAddress.Address
  readonly assets: CoreAssets.Assets
  readonly datum?: CoreDatumOption.DatumOption
  readonly scriptRef?: CoreScriptRef.ScriptRef
}

/**
 * Parameters for collectFrom operation.
 *
 * The redeemer supports three modes:
 * - **Static**: Direct `Data` value when index isn't needed
 * - **Self**: `(input: IndexedInput) => Data` callback for per-input redeemers
 * - **Batch**: `{ all: (inputs) => Data, inputs: UTxO[] }` for multi-input coordination
 *
 * @since 2.0.0
 */
export interface CollectFromParams {
  /** UTxOs to consume as transaction inputs */
  readonly inputs: ReadonlyArray<UTxO.UTxO>
  /** Optional redeemer for script-locked UTxOs (static, self, or batch mode) */
  readonly redeemer?: RedeemerBuilder.RedeemerArg
}

export interface ReadFromParams {
  readonly referenceInputs: ReadonlyArray<UTxO.UTxO> // Mandatory: UTxOs to read as reference inputs
}

/**
 * Parameters for mint operation.
 *
 * The redeemer supports three modes:
 * - **Static**: Direct `Data` value when index isn't needed
 * - **Self**: `(input: IndexedInput) => Data` callback (index is policy index)
 * - **Batch**: `{ all: (inputs) => Data, inputs: UTxO[] }` for multi-policy coordination
 *
 * @since 2.0.0
 */
export interface MintTokensParams {
  /** Tokens to mint (positive) or burn (negative), excluding lovelace */
  readonly assets: CoreAssets.Assets
  /** Optional redeemer for Plutus minting policies (static, self, or batch mode) */
  readonly redeemer?: RedeemerBuilder.RedeemerArg
}