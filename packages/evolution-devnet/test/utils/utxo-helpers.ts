import type * as Assets from "@evolution-sdk/evolution/sdk/Assets"
import type * as Datum from "@evolution-sdk/evolution/sdk/Datum"
import type * as Script from "@evolution-sdk/evolution/sdk/Script"
import type * as UTxO from "@evolution-sdk/evolution/sdk/UTxO"

/**
 * Options for creating a test UTxO.
 */
export type CreateTestUtxoOptions = {
  /**
   * The address of the UTxO. Defaults to a test address.
   * @default "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae"
   */
  address?: string
  /**
   * Optional datum to attach to the UTxO.
   */
  datumOption?: Datum.Datum
  /**
   * The amount of lovelace in the UTxO.
   */
  lovelace: bigint
  /**
   * Optional native assets to include in the UTxO.
   * Map of policyId+assetName (hex encoded) to quantity.
   */
  nativeAssets?: Record<string, bigint>
  /**
   * The output index. Defaults to 0.
   * @default 0
   */
  outputIndex?: number
  /**
   * Optional reference script to attach to the UTxO.
   */
  scriptRef?: Script.Script
  /**
   * The transaction hash. Defaults to 64 zeros.
   * @default "0".repeat(64)
   */
  txHash?: string
}

/**
 * Default test address used when no address is provided.
 */
const DEFAULT_TEST_ADDRESS =
  "addr_test1qz2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae"

/**
 * Creates a test UTxO with the specified parameters.
 */
export const createTestUtxo = (options: CreateTestUtxoOptions): UTxO.UTxO => {
  const {
    address = DEFAULT_TEST_ADDRESS,
    datumOption,
    lovelace,
    nativeAssets,
    outputIndex = 0,
    scriptRef,
    txHash = "0".repeat(64)
  } = options

  // Ensure txHash is 64 hex characters (convert short IDs to valid hex)
  const paddedTxHash = txHash.length === 64 && /^[0-9a-fA-F]+$/.test(txHash)
    ? txHash
    : Array.from(txHash)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .padEnd(64, '0')

  const assets: Assets.Assets = nativeAssets
    ? { lovelace, ...nativeAssets }
    : { lovelace }

  return {
    address,
    assets,
    datumOption,
    outputIndex,
    scriptRef,
    txHash: paddedTxHash
  }
}
