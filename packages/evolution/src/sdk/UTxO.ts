import { Effect } from "effect"

import * as CoreAddress from "../core/Address.js"
import * as TransactionHash from "../core/TransactionHash.js"
import * as CoreUTxO from "../core/UTxO.js"
import * as Assets from "./Assets.js"
import * as Datum from "./Datum.js"
import * as OutRef from "./OutRef.js"
import type * as Script from "./Script.js"

/**
 * Transaction output before it's submitted on-chain.
 * Similar to UTxO but without txHash/outputIndex since those don't exist yet.
 */
export interface TxOutput {
  address: string
  assets: Assets.Assets
  datumOption?: Datum.Datum
  scriptRef?: Script.Script
}

/**
 * UTxO (Unspent Transaction Output) - a TxOutput that has been confirmed on-chain
 * and has a txHash and outputIndex identifying it.
 */
export interface UTxO extends TxOutput {
  txHash: string
  outputIndex: number
}

/**
 * Convert a TxOutput to a UTxO by adding txHash and outputIndex.
 * Used after transaction submission when outputs become UTxOs on-chain.
 * 
 * @since 2.0.0
 * @category constructors
 */
export const toUTxO = (output: TxOutput, txHash: string, outputIndex: number): UTxO => ({
  ...output,
  txHash,
  outputIndex
})

export const hasAssets = (utxo: UTxO): boolean => !Assets.isEmpty(utxo.assets)

export const hasLovelace = (utxo: UTxO): boolean => Assets.getAsset(utxo.assets, "lovelace") > 0n

export const getLovelace = (utxo: UTxO): bigint => Assets.getAsset(utxo.assets, "lovelace")

export const hasNativeTokens = (utxo: UTxO): boolean => {
  const units = Assets.getUnits(utxo.assets)
  return units.length > 1 || (units.length === 1 && units[0] !== "lovelace")
}

export const hasDatum = (utxo: UTxO): boolean => utxo.datumOption !== undefined

export const hasScript = (utxo: UTxO): boolean => utxo.scriptRef !== undefined

// OutRef operations
export const getOutRef = (utxo: UTxO): OutRef.OutRef => ({
  txHash: utxo.txHash,
  outputIndex: utxo.outputIndex
})

// Datum type guards and utilities
export const getDatumHash = (utxo: UTxO): string | undefined =>
  Datum.isDatumHash(utxo.datumOption) ? utxo.datumOption.hash : undefined

export const getInlineDatum = (utxo: UTxO): string | undefined =>
  Datum.isInlineDatum(utxo.datumOption) ? utxo.datumOption.inline : undefined

// Value operations
export const getValue = (utxo: UTxO): Assets.Assets => utxo.assets

export const withAssets = (utxo: UTxO, assets: Assets.Assets): UTxO => ({
  ...utxo,
  assets
})

export const addAssets = (utxo: UTxO, assets: Assets.Assets): UTxO => withAssets(utxo, Assets.add(utxo.assets, assets))

export const subtractAssets = (utxo: UTxO, assets: Assets.Assets): UTxO =>
  withAssets(utxo, Assets.subtract(utxo.assets, assets))

// Datum operations
export const withDatum = (utxo: UTxO, datumOption: Datum.Datum): UTxO => ({
  ...utxo,
  datumOption
})

export const withoutDatum = (utxo: UTxO): UTxO => ({
  ...utxo,
  datumOption: undefined
})

// Script operations
export const withScript = (utxo: UTxO, scriptRef: Script.Script): UTxO => ({
  ...utxo,
  scriptRef
})

export const withoutScript = (utxo: UTxO): UTxO => ({
  ...utxo,
  scriptRef: undefined
})

// UTxO Collection utilities
export type UTxOSet = Array<UTxO>

export const fromArray = (utxos: Array<UTxO>): UTxOSet => utxos

export const toArray = (utxoSet: UTxOSet): Array<UTxO> => utxoSet

export const filterByAddress = (utxoSet: UTxOSet, address: string): UTxOSet =>
  utxoSet.filter((utxo) => utxo.address === address)

export const filterByAsset = (utxoSet: UTxOSet, unit: string): UTxOSet =>
  utxoSet.filter((utxo) => Assets.hasAsset(utxo.assets, unit))

export const filterByMinLovelace = (utxoSet: UTxOSet, minLovelace: bigint): UTxOSet =>
  utxoSet.filter((utxo) => getLovelace(utxo) >= minLovelace)

export const filterWithDatum = (utxoSet: UTxOSet): UTxOSet => utxoSet.filter(hasDatum)

export const filterWithScript = (utxoSet: UTxOSet): UTxOSet => utxoSet.filter(hasScript)

export const sortByLovelace = (utxoSet: UTxOSet, ascending = true): UTxOSet =>
  [...utxoSet].sort((a, b) => {
    const diff = getLovelace(a) - getLovelace(b)
    return ascending ? Number(diff) : Number(-diff)
  })

export const getTotalAssets = (utxoSet: UTxOSet): Assets.Assets =>
  utxoSet.reduce((total, utxo) => Assets.add(total, utxo.assets), Assets.empty())

export const getTotalLovelace = (utxoSet: UTxOSet): bigint =>
  utxoSet.reduce((total, utxo) => total + getLovelace(utxo), 0n)

export const findByOutRef = (utxoSet: UTxOSet, outRef: OutRef.OutRef): UTxO | undefined =>
  utxoSet.find((utxo) => OutRef.equals(getOutRef(utxo), outRef))

export const removeByOutRef = (utxoSet: UTxOSet, outRef: OutRef.OutRef): UTxOSet =>
  utxoSet.filter((utxo) => !OutRef.equals(getOutRef(utxo), outRef))

export const isEmpty = (utxoSet: UTxOSet): boolean => utxoSet.length === 0

export const size = (utxoSet: UTxOSet): number => utxoSet.length

// UTxO Set operations
export const union = (setA: UTxOSet, setB: UTxOSet): UTxOSet => {
  const result = [...setA]
  for (const utxo of setB) {
    if (!findByOutRef(result, getOutRef(utxo))) {
      result.push(utxo)
    }
  }
  return result
}

export const intersection = (setA: UTxOSet, setB: UTxOSet): UTxOSet =>
  setA.filter((utxoA) => findByOutRef(setB, getOutRef(utxoA)) !== undefined)

export const difference = (setA: UTxOSet, setB: UTxOSet): UTxOSet =>
  setA.filter((utxoA) => findByOutRef(setB, getOutRef(utxoA)) === undefined)

// Enhanced collection utilities
export const find = (utxos: UTxOSet, predicate: (utxo: UTxO) => boolean): UTxO | undefined => utxos.find(predicate)

export const filter = (utxos: UTxOSet, predicate: (utxo: UTxO) => boolean): UTxOSet => utxos.filter(predicate)

export const map = <T>(utxos: UTxOSet, mapper: (utxo: UTxO) => T): Array<T> => utxos.map(mapper)

export const reduce = <T>(utxos: UTxOSet, reducer: (acc: T, utxo: UTxO) => T, initial: T): T =>
  utxos.reduce(reducer, initial)

// Specialized finders
export const findByAddress = (utxos: UTxOSet, address: string): UTxOSet =>
  filter(utxos, (utxo) => utxo.address === address)

export const findWithDatumHash = (utxos: UTxOSet, hash: string): UTxOSet =>
  filter(utxos, (utxo) => getDatumHash(utxo) === hash)

export const findWithMinLovelace = (utxos: UTxOSet, minLovelace: bigint): UTxOSet =>
  filter(utxos, (utxo) => getLovelace(utxo) >= minLovelace)

// Equals utility
export const equals = (a: UTxO, b: UTxO): boolean => OutRef.equals(getOutRef(a), getOutRef(b))

// Core type conversion
/**
 * Convert SDK UTxO to Core UTxO.
 * This is an Effect as it needs to parse the address and transaction hash.
 * 
 * @since 2.0.0
 * @category conversion
 */
export const toCore = (utxo: UTxO): Effect.Effect<CoreUTxO.UTxO, Error> =>
  Effect.gen(function* () {
    // Convert address from bech32 string to Core Address
    const address = yield* Effect.try({
      try: () => CoreAddress.fromBech32(utxo.address),
      catch: (e) => new Error(`Failed to parse address: ${e}`)
    })
    
    // Convert txHash from hex string to TransactionHash
    const transactionId = yield* Effect.try({
      try: () => TransactionHash.fromHex(utxo.txHash),
      catch: (e) => new Error(`Failed to parse txHash: ${e}`)
    })
    
    // Convert assets from SDK Assets to Core Assets
    const assets = Assets.toCoreAssets(utxo.assets)
    
    return new CoreUTxO.UTxO({
      transactionId,
      index: BigInt(utxo.outputIndex),
      address,
      assets
    })
  })

/**
 * Convert array of SDK UTxOs to Core UTxOs.
 * 
 * @since 2.0.0
 * @category conversion
 */
export const toCoreArray = (utxos: ReadonlyArray<UTxO>): Effect.Effect<ReadonlyArray<CoreUTxO.UTxO>, Error> =>
  Effect.all(utxos.map(toCore))

/**
 * Convert Core UTxO to SDK UTxO.
 * This is a pure function as all data is available to convert.
 * 
 * @since 2.0.0
 * @category conversion
 */
export const fromCore = (utxo: CoreUTxO.UTxO): UTxO => ({
  txHash: TransactionHash.toHex(utxo.transactionId),
  outputIndex: Number(utxo.index),
  address: CoreAddress.toBech32(utxo.address),
  assets: Assets.fromCoreAssets(utxo.assets),
  // TODO: Convert datum and script if present
  datumOption: undefined,
  scriptRef: undefined
})

/**
 * Convert array of Core UTxOs to SDK UTxOs.
 * 
 * @since 2.0.0
 * @category conversion
 */
export const fromCoreArray = (utxos: ReadonlyArray<CoreUTxO.UTxO>): ReadonlyArray<UTxO> =>
  utxos.map(fromCore)
