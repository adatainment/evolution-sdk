/**
 * SDK Address module - user-friendly Bech32 string representation
 *
 * @since 2.0.0
 */

import { Schema } from "effect"

import * as CoreAddress from "../core/Address.js"

export type Address = string

export const toCoreAddress = Schema.decodeSync(CoreAddress.FromBech32)
export const fromCoreAddress = Schema.encodeSync(CoreAddress.FromBech32)
