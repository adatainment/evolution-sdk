/**
 * Collect operation - adds UTxOs as transaction inputs.
 *
 * @module operations/Collect
 * @since 2.0.0
 */

import { Effect, Ref } from "effect"

import * as CoreAssets from "../../../core/Assets/index.js"
import * as UTxO from "../../../core/UTxO.js"
import * as RedeemerBuilder from "../RedeemerBuilder.js"
import { TransactionBuilderError, TxContext } from "../TransactionBuilder.js"
import { calculateTotalAssets, filterScriptUtxos } from "../TxBuilderImpl.js"
import type { CollectFromParams } from "./Operations.js"

/**
 * Creates a ProgramStep for collectFrom operation.
 * Adds UTxOs as transaction inputs, validates script requirements, and tracks assets.
 *
 * Implementation:
 * 1. Validates that inputs array is not empty
 * 2. Checks if any inputs are script-locked (require redeemers)
 * 3. Validates redeemer is provided for script-locked UTxOs
 * 4. Adds UTxOs to state.selectedUtxos
 * 5. Tracks redeemer information for script spending (supports deferred resolution)
 * 6. Updates total input assets for balancing
 *
 * **RedeemerBuilder Support:**
 * - Static: Direct Data value stored immediately
 * - Self: Callback stored for per-input resolution after coin selection
 * - Batch: Callback + input set stored for multi-input resolution
 *
 * @since 2.0.0
 * @category programs
 */
export const createCollectFromProgram = (params: CollectFromParams) =>
  Effect.gen(function* () {
    const ctx = yield* TxContext

    // 1. Validate inputs exist
    if (params.inputs.length === 0) {
      return yield* Effect.fail(
        new TransactionBuilderError({
          message: "No inputs provided to collectFrom"
        })
      )
    }

    // 2. Filter script-locked UTxOs
    const scriptUtxos = yield* filterScriptUtxos(params.inputs)

    // 3. Validate redeemer for script UTxOs
    if (scriptUtxos.length > 0 && !params.redeemer) {
      return yield* Effect.fail(
        new TransactionBuilderError({
          message: `Redeemer required for ${scriptUtxos.length} script-locked UTxO(s)`
        })
      )
    }

    // 4. Add UTxOs to selected inputs and track redeemers and input assets
    const inputAssets = calculateTotalAssets(params.inputs)

    yield* Ref.update(ctx, (state) => {
      let newRedeemers = state.redeemers
      let newDeferredRedeemers = state.deferredRedeemers

      // 5. Track redeemer information if spending from scripts
      if (params.redeemer && scriptUtxos.length > 0) {
        const deferred = RedeemerBuilder.toDeferredRedeemer(params.redeemer)

        if (deferred._tag === "static") {
          // Static mode: store resolved data immediately
          newRedeemers = new Map(state.redeemers)
          scriptUtxos.forEach((utxo) => {
            const inputKey = UTxO.toOutRefString(utxo)
            newRedeemers.set(inputKey, {
              tag: "spend",
              data: deferred.data,
              exUnits: undefined
            })
          })
        } else {
          // Self or Batch mode: store deferred for resolution after coin selection
          newDeferredRedeemers = new Map(state.deferredRedeemers)
          scriptUtxos.forEach((utxo) => {
            const inputKey = UTxO.toOutRefString(utxo)
            newDeferredRedeemers.set(inputKey, {
              tag: "spend",
              deferred,
              exUnits: undefined
            })
          })
        }
      }

      return {
        ...state,
        selectedUtxos: [...state.selectedUtxos, ...params.inputs],
        redeemers: newRedeemers,
        deferredRedeemers: newDeferredRedeemers,
        totalInputAssets: CoreAssets.merge(state.totalInputAssets, inputAssets)
      }
    })
  })
