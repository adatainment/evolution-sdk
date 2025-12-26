/**
 * Shared evaluator logic - platform agnostic
 *
 * @packageDocumentation
 */

import * as Bytes from "@evolution-sdk/evolution/core/Bytes"
import * as CBOR from "@evolution-sdk/evolution/core/CBOR"
import * as Redeemer from "@evolution-sdk/evolution/core/Redeemer"
import * as Script from "@evolution-sdk/evolution/core/Script"
import * as ScriptRef from "@evolution-sdk/evolution/core/ScriptRef"
import * as Transaction from "@evolution-sdk/evolution/core/Transaction"
import * as TransactionInput from "@evolution-sdk/evolution/core/TransactionInput"
import * as TxOut from "@evolution-sdk/evolution/core/TxOut"
import type * as UTxO from "@evolution-sdk/evolution/core/UTxO"
import type * as TransactionBuilder from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder"
import { EvaluationError } from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder"
import type * as EvalRedeemer from "@evolution-sdk/evolution/sdk/EvalRedeemer"
import { Effect } from "effect"

import type * as WasmLoader from "./WasmLoader.js"

/**
 * Convert UTxO to input CBOR bytes (transaction hash + index).
 */
function inputCBORFromUtxo(utxo: UTxO.UTxO): Uint8Array {
  const txInput = new TransactionInput.TransactionInput({
    transactionId: utxo.transactionId,
    index: utxo.index
  })
  return TransactionInput.toCBORBytes(txInput)
}

/**
 * Convert UTxO output to CBOR bytes.
 */
function outputCBORFromUtxo(utxo: UTxO.UTxO): Uint8Array {
  const scriptRef = utxo.scriptRef ? new ScriptRef.ScriptRef({ bytes: Script.toCBOR(utxo.scriptRef) }) : undefined

  const txOut = new TxOut.TransactionOutput({
    address: utxo.address,
    assets: utxo.assets,
    datumOption: utxo.datumOption,
    scriptRef
  })

  return TxOut.toCBORBytes(txOut)
}

/**
 * Parse CBOR-encoded EvalRedeemer result from WASM.
 * Uses the official Redeemer.fromCBORBytes which handles the 4-element tuple:
 * [tag, index, data, [mem, steps]]
 */
function evalRedeemerFromCBOR(bytes: Uint8Array): EvalRedeemer.EvalRedeemer {
  // Decode using official Redeemer module
  const redeemer = Redeemer.fromCBORBytes(bytes, CBOR.CML_DEFAULT_OPTIONS)

  const tagBigInt = Redeemer.tagToInteger(redeemer.tag)
  const indexBigInt = redeemer.index
  const memBigInt = redeemer.exUnits.mem
  const stepsBigInt = redeemer.exUnits.steps

  // Map Redeemer.RedeemerTag to EvalRedeemer tag format
  const tagMap: Record<Redeemer.RedeemerTag, EvalRedeemer.EvalRedeemer["redeemer_tag"]> = {
    spend: "spend",
    mint: "mint",
    cert: "publish",
    reward: "withdraw"
  }

  const redeemer_tag: EvalRedeemer.EvalRedeemer["redeemer_tag"] = Effect.gen(function* () {
    // Handle Conway-era tags (vote=4, propose=5)
    if (tagBigInt === 4n) return "vote"
    if (tagBigInt === 5n) return "propose"

    // Standard tags (0-3)
    const mappedTag = tagMap[redeemer.tag]
    if (!mappedTag) {
      throw new Error(`Unknown redeemer tag: ${redeemer.tag} (${tagBigInt})`)
    }
    return mappedTag
  }).pipe(Effect.runSync)

  return {
    redeemer_tag,
    redeemer_index: Number(indexBigInt),
    ex_units: {
      mem: Number(memBigInt),
      steps: Number(stepsBigInt)
    }
  }
}

/**
 * Create Aiken evaluator - accepts WASM module
 */
export function makeEvaluator(wasmModule: WasmLoader.WasmModule): TransactionBuilder.Evaluator {
  return {
    evaluate: (
      tx: Transaction.Transaction,
      additionalUtxos: ReadonlyArray<UTxO.UTxO> | undefined,
      context: TransactionBuilder.EvaluationContext
    ) =>
      Effect.gen(function* () {
        yield* Effect.logDebug("[Aiken UPLC] Starting evaluation")

        // Serialize transaction to CBOR bytes
        const txBytes = Transaction.toCBORBytes(tx)

        yield* Effect.logDebug(`[Aiken UPLC] Transaction CBOR bytes: ${txBytes.length}`)

        const utxos = additionalUtxos ?? []
        yield* Effect.logDebug(`[Aiken UPLC] Additional UTxOs: ${utxos.length}`)

        // Serialize UTxOs to CBOR arrays
        const utxosX = utxos.map(inputCBORFromUtxo)
        const utxosY = utxos.map(outputCBORFromUtxo)

        const { slotLength, zeroSlot, zeroTime } = context.slotConfig

        yield* Effect.logDebug(
          `[Aiken UPLC] Slot config - zeroTime: ${zeroTime}, zeroSlot: ${zeroSlot}, slotLength: ${slotLength}`
        )
        yield* Effect.logDebug(`[Aiken UPLC] Cost models CBOR length: ${context.costModels.length} bytes`)
        yield* Effect.logDebug(`[Aiken UPLC] Cost models hex: ${Bytes.toHex(context.costModels)}`)
        yield* Effect.logDebug(
          `[Aiken UPLC] Max execution - steps: ${context.maxTxExSteps}, mem: ${context.maxTxExMem}`
        )

        // Note: Some protocol parameters (especially cost models) may contain values
        // that overflow i64 during CBOR decoding in the WASM evaluator.
        // This is a known limitation when cost model parameters are set to large values (e.g., 2^63).
        yield* Effect.logDebug("[Aiken UPLC] Calling eval_phase_two_raw...")
        const resultBytes = yield* Effect.try({
          try: () =>
            wasmModule.eval_phase_two_raw(
              txBytes,
              utxosX,
              utxosY,
              context.costModels,
              context.maxTxExSteps,
              context.maxTxExMem,
              BigInt(zeroTime),
              BigInt(zeroSlot),
              slotLength
            ),
          catch: (error) => {
            return new EvaluationError({
              cause: error,
              message: error instanceof Error ? error.message : "UPLC evaluation failed"
            })
          }
        })

        yield* Effect.logDebug(`[Aiken UPLC] Evaluation successful - ${resultBytes.length} redeemer(s) returned`)

        const evalRedeemers = yield* Effect.try({
          try: () => resultBytes.map(evalRedeemerFromCBOR),
          catch: (error) =>
            new EvaluationError({
              cause: error,
              message: error instanceof Error ? error.message : "Failed to parse evaluation results"
            })
        })

        return evalRedeemers
      })
  }
}
