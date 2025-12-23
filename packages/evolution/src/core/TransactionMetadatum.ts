import { Data, FastCheck, Schema } from "effect"

import * as CBOR from "./CBOR.js"
import * as Function from "./Function.js"
import * as Numeric from "./Numeric.js"

/**
 * Error class for transaction metadatum related operations.
 *
 * @since 2.0.0
 * @category errors
 */
export class TransactionMetadatumError extends Data.TaggedError("TransactionMetadatumError")<{
  message?: string
  cause?: unknown
}> {}

/**
 * Encoded type for transaction metadata (wire format with string for bigint)
 *
 * @since 2.0.0
 * @category model
 */
export type TransactionMetadatumEncoded =
  // String (text stays as string)
  | string
  // Int (stays as bigint in CBOR)
  | bigint
  // Bytes (Uint8ArrayFromHex encodes to hex string)
  | string
  // Map (encoded as array of [key, value] pairs)
  | ReadonlyArray<readonly [TransactionMetadatumEncoded, TransactionMetadatumEncoded]>
  // Array
  | ReadonlyArray<TransactionMetadatumEncoded>

/**
 * Transaction metadata type definition (runtime type).
 *
 * Transaction metadata supports text strings, integers, byte arrays, arrays, and maps.
 * Following CIP-10 standard metadata registry.
 *
 * @since 2.0.0
 * @category model
 */
export type TransactionMetadatum =
  // Text string
  | string
  // Integer (runtime as bigint)
  | bigint
  // Bytes (runtime as Uint8Array)
  | Uint8Array
  // Map (using standard Map)
  | globalThis.Map<TransactionMetadatum, TransactionMetadatum>
  // Array
  | ReadonlyArray<TransactionMetadatum>

/**
 * TransactionMetadatumMap type alias
 *
 * @since 2.0.0
 * @category model
 */
export type Map = globalThis.Map<TransactionMetadatum, TransactionMetadatum>

/**
 * TransactionMetadatumList type alias
 *
 * @since 2.0.0
 * @category model
 */
export type List = ReadonlyArray<TransactionMetadatum>

/**
 * Schema for TransactionMetadatum map type
 *
 * @category schemas
 * @since 2.0.0
 */
export const MapSchema: Schema.Schema<Map, TransactionMetadatumEncoded> = Schema.Map({
  key: Schema.suspend(() => TransactionMetadatumSchema).annotations({
    identifier: "TransactionMetadatum.Map.Key",
    title: "Map Key",
    description: "The key of the metadata map, must be a TransactionMetadatum type"
  }),
  value: Schema.suspend(() => TransactionMetadatumSchema).annotations({
    identifier: "TransactionMetadatum.Map.Value",
    title: "Map Value",
    description: "The value of the metadata map, must be a TransactionMetadatum type"
  })
}).annotations({
  identifier: "TransactionMetadatum.Map",
  title: "Metadata Map",
  description: "A map of TransactionMetadatum key-value pairs"
}) as any

/**
 * Schema for TransactionMetadatum list type
 *
 * @category schemas
 * @since 2.0.0
 */
export const ListSchema: Schema.Schema<List, TransactionMetadatumEncoded> = Schema.Array(
  Schema.suspend(() => TransactionMetadatumSchema)
).annotations({
  identifier: "TransactionMetadatum.List",
  title: "Metadata List",
  description: "An array of TransactionMetadatum values"
}) as any

/**
 * Schema for TransactionMetadatum string type
 *
 * @category schemas
 * @since 2.0.0
 */
export const TextSchema = Schema.String.annotations({
  identifier: "TransactionMetadatum.Text",
  title: "Metadata Text",
  description: "A text string value in transaction metadata"
})

/**
 * Schema for TransactionMetadatum integer type
 *
 * @category schemas
 * @since 2.0.0
 */
export const IntSchema = Numeric.Int64.annotations({
  identifier: "TransactionMetadatum.Int",
  title: "Metadata Integer",
  description: "An integer value in transaction metadata (64-bit signed)"
})

/**
 * Schema for TransactionMetadatum bytes type
 *
 * @category schemas
 * @since 2.0.0
 */
export const BytesSchema = Schema.Uint8ArrayFromHex.annotations({
  identifier: "TransactionMetadatum.Bytes",
  title: "Metadata Bytes",
  description: "A byte array value in transaction metadata"
})

/**
 * Union schema for all types of transaction metadata.
 *
 * @since 2.0.0
 * @category schemas
 */
export const TransactionMetadatumSchema: Schema.Schema<TransactionMetadatum, TransactionMetadatumEncoded> = Schema.Union(
  TextSchema,
  IntSchema,
  BytesSchema,
  ListSchema,
  MapSchema
).annotations({
  identifier: "TransactionMetadatum",
  description: "Transaction metadata supporting text, integers, bytes, arrays, and maps"
}) as any

// ============================================================================
// CBOR Functions
// ============================================================================

/**
 * Schema transformer for TransactionMetadatum from CBOR bytes.
 *
 * @since 2.0.0
 * @category schemas
 */
export const FromCBORBytes = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  CBOR.FromBytes(options).pipe(Schema.compose(TransactionMetadatumSchema)).annotations({
    identifier: "TransactionMetadatum.FromCBORBytes",
    description: "Transforms CBOR bytes to TransactionMetadatum"
  })

/**
 * Schema transformer for TransactionMetadatum from CBOR hex string.
 *
 * @since 2.0.0
 * @category schemas
 */
export const FromCBORHex = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  CBOR.FromHex(options).pipe(Schema.compose(FromCBORBytes(options))).annotations({
    identifier: "TransactionMetadatum.FromCBORHex",
    description: "Transforms CBOR hex string to TransactionMetadatum"
  })

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if two TransactionMetadatum instances are equal.
 *
 * @since 2.0.0
 * @category utilities
 */
export const equals = (a: TransactionMetadatum, b: TransactionMetadatum): boolean => {
  // String comparison
  if (typeof a === "string" && typeof b === "string") {
    return a === b
  }
  
  // BigInt comparison
  if (typeof a === "bigint" && typeof b === "bigint") {
    return a === b
  }
  
  // Uint8Array comparison
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    return a.length === b.length && a.every((byte, i) => byte === b[i])
  }
  
  // Array comparison
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => equals(item, b[i]))
  }
  
  // Map comparison
  if (a instanceof globalThis.Map && b instanceof globalThis.Map) {
    if (a.size !== b.size) return false
    for (const [key, value] of a.entries()) {
      let found = false
      for (const [bKey, bVal] of b.entries()) {
        if (equals(key, bKey)) {
          if (!equals(value, bVal)) return false
          found = true
          break
        }
      }
      if (!found) return false
    }
    return true
  }
  
  return false
}

/**
 * FastCheck arbitrary for generating random TransactionMetadatum instances.
 *
 * @since 2.0.0
 * @category testing
 */
const I64_MIN = -(1n << 63n)
const I64_MAX = (1n << 63n) - 1n
const int64Arbitrary = FastCheck.bigInt({ min: I64_MIN, max: I64_MAX })

export const arbitrary: FastCheck.Arbitrary<TransactionMetadatum> = FastCheck.oneof(
  FastCheck.string(),
  int64Arbitrary,
  FastCheck.uint8Array({ minLength: 1, maxLength: 64 }),
  FastCheck.array(
    FastCheck.oneof(
      FastCheck.string(),
      int64Arbitrary
    ),
    { maxLength: 5 }
  ),
  FastCheck.uniqueArray(
    FastCheck.tuple(
      FastCheck.string(),
      int64Arbitrary
    ),
    {
      maxLength: 5,
      selector: ([key]) => key // Ensure unique keys
    }
  ).map((entries) => new globalThis.Map(entries))
)

// ============================================================================
// Parsing Functions
// ============================================================================

/**
 * Parse a TransactionMetadatum from CBOR bytes.
 *
 * @since 2.0.0
 * @category parsing
 */
export const fromCBORBytes = Function.makeCBORDecodeSync(
  TransactionMetadatumSchema,
  TransactionMetadatumError,
  "TransactionMetadatum.fromCBORBytes"
)

/**
 * Parse a TransactionMetadatum from CBOR hex string.
 *
 * @since 2.0.0
 * @category parsing
 */
export const fromCBORHex = Function.makeCBORDecodeHexSync(
  TransactionMetadatumSchema,
  TransactionMetadatumError,
  "TransactionMetadatum.fromCBORHex"
)

// ============================================================================
// Encoding Functions
// ============================================================================

/**
 * Convert a TransactionMetadatum to CBOR bytes.
 *
 * @since 2.0.0
 * @category encoding
 */
export const toCBORBytes = Function.makeCBOREncodeSync(
  TransactionMetadatumSchema,
  TransactionMetadatumError,
  "TransactionMetadatum.toCBORBytes"
)

/**
 * Convert a TransactionMetadatum to CBOR hex string.
 *
 * @since 2.0.0
 * @category encoding
 */
export const toCBORHex = Function.makeCBOREncodeHexSync(
  TransactionMetadatumSchema,
  TransactionMetadatumError,
  "TransactionMetadatum.toCBORHex"
)

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a text TransactionMetadatum from a string value.
 *
 * @since 2.0.0
 * @category constructors
 */
export const text = (value: string): string => value

/**
 * Create an integer TransactionMetadatum from a bigint value.
 *
 * @since 2.0.0
 * @category constructors
 */
export const int = (value: bigint): bigint => value

/**
 * Create a bytes TransactionMetadatum from a Uint8Array value.
 *
 * @since 2.0.0
 * @category constructors
 */
export const bytes = (value: Uint8Array): Uint8Array => value

/**
 * Create an array TransactionMetadatum from an array of TransactionMetadatum values.
 *
 * @since 2.0.0
 * @category constructors
 */
export const array = (value: Array<TransactionMetadatum>): List => value

/**
 * Create a map TransactionMetadatum from a Map of TransactionMetadatum key-value pairs.
 *
 * @since 2.0.0
 * @category constructors
 */
export const map = (value: globalThis.Map<TransactionMetadatum, TransactionMetadatum>): Map => value

// ============================================================================
// Effect Namespace - Effect-based Error Handling
// ============================================================================

/**
 * Effect-based error handling variants for functions that can fail.
 *
 * @since 2.0.0
 * @category effect
 */
export namespace Either {
  /**
   * Parse a TransactionMetadatum from CBOR bytes with Effect error handling.
   *
   * @since 2.0.0
   * @category parsing
   */
  export const fromCBORBytes = Function.makeCBORDecodeEither(TransactionMetadatumSchema, TransactionMetadatumError)

  /**
   * Parse a TransactionMetadatum from CBOR hex string with Effect error handling.
   *
   * @since 2.0.0
   * @category parsing
   */
  export const fromCBORHex = Function.makeCBORDecodeHexEither(TransactionMetadatumSchema, TransactionMetadatumError)

  /**
   * Convert a TransactionMetadatum to CBOR bytes with Effect error handling.
   *
   * @since 2.0.0
   * @category encoding
   */
  export const toCBORBytes = Function.makeCBOREncodeEither(TransactionMetadatumSchema, TransactionMetadatumError)

  /**
   * Convert a TransactionMetadatum to CBOR hex string with Effect error handling.
   *
   * @since 2.0.0
   * @category encoding
   */
  export const toCBORHex = Function.makeCBOREncodeHexEither(TransactionMetadatumSchema, TransactionMetadatumError)
}
