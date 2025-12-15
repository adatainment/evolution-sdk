import type { ParseResult} from "effect";
import { Effect, Equal, Hash, HashSet, Inspectable, Schema } from "effect"

import type * as SDKAssets from "../sdk/Assets.js"
import type * as SDKDatum from "../sdk/Datum.js"
import type * as SDKScript from "../sdk/Script.js"
import type * as SDKUTxO from "../sdk/UTxO.js"
import * as Address from "./Address.js"
import * as Assets from "./Assets/index.js"
import * as Bytes32 from "./Bytes32.js"
import * as PlutusData from "./Data.js"
import * as DatumOption from "./DatumOption.js"
import * as Numeric from "./Numeric.js"
import * as ScriptRef from "./ScriptRef.js"
import * as TransactionHash from "./TransactionHash.js"

/**
 * UTxO (Unspent Transaction Output) - A transaction output with its on-chain reference.
 *
 * Combines TransactionOutput with the transaction reference (transactionId + index)
 * that uniquely identifies it on the blockchain.
 *
 * @since 2.0.0
 * @category model
 */
export class UTxO extends Schema.TaggedClass<UTxO>()("UTxO", {
  transactionId: TransactionHash.TransactionHash,
  index: Numeric.Uint16Schema,
  address: Address.Address,
  assets: Assets.Assets,
  datumOption: Schema.optional(DatumOption.DatumOptionSchema),
  scriptRef: Schema.optional(ScriptRef.ScriptRef)
}) {
  toJSON() {
    return {
      _tag: this._tag,
      transactionId: this.transactionId.toJSON(),
      index: this.index.toString(),
      address: this.address.toJSON(),
      assets: this.assets.toJSON(),
      datumOption: this.datumOption?.toJSON(),
      scriptRef: this.scriptRef?.toJSON()
    }
  }

  toString(): string {
    return Inspectable.format(this.toJSON())
  }

  [Inspectable.NodeInspectSymbol](): unknown {
    return this.toJSON()
  }

  [Equal.symbol](that: unknown): boolean {
    return (
      that instanceof UTxO &&
      Equal.equals(this.transactionId, that.transactionId) &&
      this.index === that.index &&
      Equal.equals(this.address, that.address) &&
      Equal.equals(this.assets, that.assets) &&
      Equal.equals(this.datumOption, that.datumOption) &&
      Equal.equals(this.scriptRef, that.scriptRef)
    )
  }

  [Hash.symbol](): number {
    return Hash.cached(this, Hash.combine(Hash.hash(this.transactionId))(Hash.number(Number(this.index))))
  }
}

/**
 * Check if the given value is a valid UTxO.
 *
 * @since 2.0.0
 * @category predicates
 */
export const isUTxO = Schema.is(UTxO)

// =============================================================================
// UTxO Set (Collection)
// =============================================================================

/**
 * A set of UTxOs with efficient lookups and set operations.
 * Uses Effect's HashSet for automatic deduplication via Hash protocol.
 *
 * @since 2.0.0
 * @category models
 */
export type UTxOSet = HashSet.HashSet<UTxO>

/**
 * Create an empty UTxO set.
 *
 * @since 2.0.0
 * @category constructors
 */
export const empty = (): UTxOSet => HashSet.empty()

/**
 * Create a UTxO set from an iterable of UTxOs.
 *
 * @since 2.0.0
 * @category constructors
 */
export const fromIterable = (utxos: Iterable<UTxO>): UTxOSet => HashSet.fromIterable(utxos)

/**
 * Add a UTxO to the set.
 *
 * @since 2.0.0
 * @category combinators
 */
export const add = (set: UTxOSet, utxo: UTxO): UTxOSet => HashSet.add(set, utxo)

/**
 * Remove a UTxO from the set.
 *
 * @since 2.0.0
 * @category combinators
 */
export const remove = (set: UTxOSet, utxo: UTxO): UTxOSet => HashSet.remove(set, utxo)

/**
 * Check if a UTxO exists in the set.
 *
 * @since 2.0.0
 * @category predicates
 */
export const has = (set: UTxOSet, utxo: UTxO): boolean => HashSet.has(set, utxo)

/**
 * Union of two UTxO sets.
 *
 * @since 2.0.0
 * @category combinators
 */
export const union = (a: UTxOSet, b: UTxOSet): UTxOSet => HashSet.union(a, b)

/**
 * Intersection of two UTxO sets.
 *
 * @since 2.0.0
 * @category combinators
 */
export const intersection = (a: UTxOSet, b: UTxOSet): UTxOSet => HashSet.intersection(a, b)

/**
 * Difference of two UTxO sets (elements in a but not in b).
 *
 * @since 2.0.0
 * @category combinators
 */
export const difference = (a: UTxOSet, b: UTxOSet): UTxOSet => HashSet.difference(a, b)

/**
 * Filter UTxOs in the set by predicate.
 *
 * @since 2.0.0
 * @category combinators
 */
export const filter = (set: UTxOSet, predicate: (utxo: UTxO) => boolean): UTxOSet =>
  HashSet.filter(set, predicate)

/**
 * Get the number of UTxOs in the set.
 *
 * @since 2.0.0
 * @category getters
 */
export const size = (set: UTxOSet): number => HashSet.size(set)

/**
 * Check if the set is empty.
 *
 * @since 2.0.0
 * @category predicates
 */
export const isEmpty = (set: UTxOSet): boolean => HashSet.size(set) === 0

/**
 * Convert a UTxO set to an array.
 *
 * @since 2.0.0
 * @category conversions
 */
export const toArray = (set: UTxOSet): Array<UTxO> => Array.from(set)

/**
 * Get the output reference string for a UTxO (txHash#index format).
 *
 * @since 2.0.0
 * @category getters
 */
export const toOutRefString = (utxo: UTxO): string =>
  `${TransactionHash.toHex(utxo.transactionId)}#${utxo.index}`

// =============================================================================
// SDK Conversion Utilities
// =============================================================================

/**
 * Convert SDK DatumOption to Core DatumOption.
 *
 * @since 2.0.0
 * @category conversions
 */
export const datumOptionFromSDK = (
  datum: SDKDatum.Datum
): Effect.Effect<DatumOption.DatumOption, ParseResult.ParseError> =>
  Effect.gen(function* () {
    if (datum.type === "inlineDatum") {
      const plutusData = yield* Schema.decodeUnknown(PlutusData.FromCBORHex())(datum.inline)
      return new DatumOption.InlineDatum({ data: plutusData })
    }
    // datumHash
    const hashBytes = yield* Schema.decodeUnknown(Bytes32.BytesFromHex)(datum.hash)
    return new DatumOption.DatumHash({ hash: hashBytes })
  })

/**
 * Convert Core DatumOption to SDK Datum.
 *
 * @since 2.0.0
 * @category conversions
 */
export const datumOptionToSDK = (datumOption: DatumOption.DatumOption): SDKDatum.Datum => {
  if (datumOption._tag === "InlineDatum") {
    return {
      type: "inlineDatum",
      inline: PlutusData.toCBORHex(datumOption.data)
    }
  }
  // DatumHash
  return {
    type: "datumHash",
    hash: Bytes32.toHex(datumOption.hash)
  }
}

/**
 * Convert SDK Script to Core ScriptRef.
 *
 * @since 2.0.0
 * @category conversions
 */
export const scriptRefFromSDK = (
  script: SDKScript.Script
): Effect.Effect<ScriptRef.ScriptRef, ParseResult.ParseError> =>
  Schema.decodeUnknown(ScriptRef.FromHex)(script.script)

/**
 * Convert Core ScriptRef to SDK Script type string.
 * Note: We lose the script type information as ScriptRef only stores bytes.
 *
 * @since 2.0.0
 * @category conversions
 */
export const scriptRefToSDKHex = (scriptRef: ScriptRef.ScriptRef): string =>
  Schema.encodeSync(Schema.Uint8ArrayFromHex)(scriptRef.bytes)

/**
 * Convert SDK UTxO to Core UTxO.
 *
 * @since 2.0.0
 * @category conversions
 */
export const fromSDK = (
  utxo: SDKUTxO.UTxO,
  toCoreAssets: (assets: SDKAssets.Assets) => Assets.Assets
): Effect.Effect<UTxO, ParseResult.ParseError> =>
  Effect.gen(function* () {
    // Parse transaction hash
    const transactionId = yield* Schema.decodeUnknown(TransactionHash.FromHex)(utxo.txHash)

    // Parse address from bech32
    const address = yield* Schema.decodeUnknown(Address.FromBech32)(utxo.address)

    // Convert assets
    const assets = toCoreAssets(utxo.assets)

    // Convert datum if present
    const datumOption = utxo.datumOption ? yield* datumOptionFromSDK(utxo.datumOption) : undefined

    // Convert script ref if present
    const scriptRef = utxo.scriptRef ? yield* scriptRefFromSDK(utxo.scriptRef) : undefined

    return new UTxO({
      transactionId,
      index: BigInt(utxo.outputIndex),
      address,
      assets,
      datumOption,
      scriptRef
    })
  })

/**
 * Convert Core UTxO to SDK UTxO.
 *
 * @since 2.0.0
 * @category conversions
 */
export const toSDK = (
  utxo: UTxO,
  fromCoreAssets: (assets: Assets.Assets) => SDKAssets.Assets
): SDKUTxO.UTxO => ({
  txHash: TransactionHash.toHex(utxo.transactionId),
  outputIndex: Number(utxo.index),
  address: Schema.encodeSync(Address.FromBech32)(utxo.address),
  assets: fromCoreAssets(utxo.assets),
  datumOption: utxo.datumOption ? datumOptionToSDK(utxo.datumOption) : undefined,
  scriptRef: utxo.scriptRef
    ? {
        type: "PlutusV3" as const, // Default type - we lose type info in ScriptRef
        script: scriptRefToSDKHex(utxo.scriptRef)
      }
    : undefined
})

/**
 * Convert an array of SDK UTxOs to a Core UTxOSet.
 *
 * @since 2.0.0
 * @category conversions
 */
export const fromSDKArray = (
  utxos: ReadonlyArray<SDKUTxO.UTxO>,
  toCoreAssets: (assets: SDKAssets.Assets) => Assets.Assets
): Effect.Effect<UTxOSet, ParseResult.ParseError> =>
  Effect.gen(function* () {
    const coreUtxos: Array<UTxO> = []
    for (const utxo of utxos) {
      coreUtxos.push(yield* fromSDK(utxo, toCoreAssets))
    }
    return fromIterable(coreUtxos)
  })

/**
 * Convert a Core UTxOSet to an array of SDK UTxOs.
 *
 * @since 2.0.0
 * @category conversions
 */
export const toSDKArray = (
  set: UTxOSet,
  fromCoreAssets: (assets: Assets.Assets) => SDKAssets.Assets
): Array<SDKUTxO.UTxO> => toArray(set).map((utxo) => toSDK(utxo, fromCoreAssets))
