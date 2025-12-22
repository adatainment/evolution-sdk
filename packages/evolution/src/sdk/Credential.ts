import { Schema } from "effect"

import * as CoreCredential from "../core/Credential.js"
import type * as CoreKeyHash from "../core/KeyHash.js"
import type * as CoreScriptHash from "../core/ScriptHash.js"

export type ScriptHash = typeof CoreScriptHash.ScriptHash.Encoded
export type KeyHash = typeof CoreKeyHash.KeyHash.Encoded

export type Credential = typeof CoreCredential.Credential.Encoded

export const fromCoreCredential = Schema.encodeSync(CoreCredential.Credential)
export const toCoreCredential = Schema.decodeSync(CoreCredential.Credential)
