import * as Bytes from "@evolution-sdk/evolution/core/Bytes"
import * as Transaction from "@evolution-sdk/evolution/core/Transaction"
import type * as UTxO from "@evolution-sdk/evolution/core/UTxO"
import * as TransactionBuilder from "@evolution-sdk/evolution/sdk/builders/TransactionBuilder"
import type * as EvalRedeemer from "@evolution-sdk/evolution/sdk/EvalRedeemer"
import { Effect } from "effect"
import * as Scalus from "scalus"

/**
 * Parse Scalus error string into ScriptFailure array.
 */
function parseScalusError(error: unknown): Array<TransactionBuilder.ScriptFailure> {
  const failures: Array<TransactionBuilder.ScriptFailure> = []

  // Check if it's a PlutusScriptEvaluationException with logs
  if (error && typeof error === "object" && "logs" in error) {
    const logs = (error as any).logs || []
    const errorMessage = error instanceof Error ? error.message : String(error)

    // TODO: Parse error message for structured failures
    // For rough draft: simple fallback
    failures.push({
      purpose: "unknown",
      index: 0,
      validationError: errorMessage,
      traces: logs
    })
  } else {
    const errorMessage = error instanceof Error ? error.message : String(error)
    failures.push({
      purpose: "unknown",
      index: 0,
      validationError: errorMessage,
      traces: []
    })
  }

  return failures
}

/**
 * Build CBOR-encoded UTxO map for Scalus.
 * Scalus expects: Map[TransactionInput, TransactionOutput]
 */
function buildUtxoMapCBOR(utxos: ReadonlyArray<UTxO.UTxO>): Uint8Array {
  // lucid specific way to encode the utxos as CBOR --  a util most likely exists
  return new Uint8Array([0xa0])
}

/**
 * Decode CBOR cost models to array format.
 */
function decodeCostModels(context: TransactionBuilder.EvaluationContext): Array<Array<number>> {
  const plutusV1 = []
  const plutusV2 = []
  const plutusV3 = []
  return [plutusV1, plutusV2, plutusV3] // PlutusV1, V2, V3
}

/**
 * Create Scalus evaluator
 */
export function makeEvaluator(): TransactionBuilder.Evaluator {
  return {
    evaluate: (
      tx: Transaction.Transaction,
      additionalUtxos: ReadonlyArray<UTxO.UTxO> | undefined,
      context: TransactionBuilder.EvaluationContext
    ) =>
      Effect.gen(function* () {
        // Serialize transaction to CBOR bytes
        const txBytes = Transaction.toCBORBytes(tx)
        const utxos = additionalUtxos ?? []
        // Build UTxO map CBOR
        const utxosBytes = buildUtxoMapCBOR(utxos)
        const { slotLength, zeroSlot, zeroTime } = context.slotConfig

        const costModels = decodeCostModels(context)

        // Scalus-specific slot config
        const slotConfig = new Scalus.SlotConfig(
          Number(zeroTime),
          Number(zeroSlot),
          slotLength
        )

        const redeemers = yield* Effect.try({
          try: () =>
            Scalus.Scalus.evalPlutusScripts(
              Array.from(txBytes),
              Array.from(utxosBytes),
              slotConfig,
              costModels
            ),
          catch: (error) => {
            // Scalus error messages and evaluation logs, if any, are available to form an exception
            const msg: string = error.message
            const logs: string[] = error.logs

            return new TransactionBuilder.EvaluationError({
              cause: error,
              msg,
              []
            })
          }
        })


        // Transform Scalus redeemers to Evolution format
        const evalRedeemers: EvalRedeemer.EvalRedeemer[] = redeemers.map((r: any) => {
          const tagMap: Record<string, EvalRedeemer.EvalRedeemer["redeemer_tag"]> = {
            "Spend": "spend",
            "Mint": "mint",
            "Cert": "publish",
            "Reward": "withdraw",
            "Voting": "vote",
            "Proposing": "propose"
          }

          return {
            redeemer_tag: tagMap[r.tag] || "spend",
            redeemer_index: r.index,
            ex_units: {
              mem: Number(r.budget.memory),
              steps: Number(r.budget.steps)
            }
          }
        })

        return evalRedeemers
      })
  }
}
