/**
 * COSE (RFC 8152) message signing for Cardano (CIP-0030).
 *
 * This module provides a TypeScript implementation of @emurgo/cardano-message-signing-nodejs,
 * offering the complete CSL message signing API surface including:
 * - COSESign1Builder: Builder for creating COSE_Sign1 structures
 * - COSESign1: Signed message representation
 * - COSEKey: COSE key representation
 * - Headers: Protected and unprotected headers
 * - HeaderMap: Map of header labels to values
 * - Label: Header label representation
 * - EdDSA25519Key: Ed25519 key operations
 *
 * @since 2.0.0
 * @category Message Signing
 */

import { Equal, FastCheck, Hash, Inspectable, ParseResult, Schema } from "effect"

import * as Bytes from "./Bytes.js"
import * as CBOR from "./CBOR.js"
import * as Ed25519Signature from "./Ed25519Signature.js"
import * as KeyHash from "./KeyHash.js"
import * as PrivateKey from "./PrivateKey.js"
import * as VKey from "./VKey.js"

// ============================================================================
// Enums
// ============================================================================

/**
 * COSE Algorithm Identifiers (RFC 8152).
 *
 * @since 2.0.0
 * @category Enums
 */
export enum AlgorithmId {
  EdDSA = -8
}

/**
 * COSE Key Type values (RFC 8152).
 *
 * @since 2.0.0
 * @category Enums
 */
export enum KeyType {
  OKP = 1,
  EC2 = 2,
  RSA = 3,
  Symmetric = 4,
  HSS_LMS = 5,
  WalnutDSA = 6
}

/**
 * COSE Curve Type values (RFC 8152).
 *
 * @since 2.0.0
 * @category Enums
 */
export enum CurveType {
  P256 = 1,
  P384 = 2,
  P521 = 3,
  X25519 = 4,
  X448 = 5,
  Ed25519 = 6,
  Ed448 = 7,
  Secp256k1 = 8
}

/**
 * COSE Key Operations (RFC 8152).
 *
 * @since 2.0.0
 * @category Enums
 */
export enum KeyOperation {
  Sign = 0,
  Verify = 1,
  Encrypt = 2,
  Decrypt = 3,
  WrapKey = 4,
  UnwrapKey = 5,
  DeriveKey = 6,
  DeriveBits = 7,
  MacCreate = 8,
  MacVerify = 9
}

/**
 * Label kind discriminator.
 *
 * @since 2.0.0
 * @category Enums
 */
export enum LabelKind {
  Int = 0,
  Text = 1
}

// ============================================================================
// Label
// ============================================================================

/**
 * COSE header label - can be an integer or text string (RFC 8152).
 *
 * @since 2.0.0
 * @category Model
 */
export class Label extends Schema.Class<Label>("Label")({
  kind: Schema.Enums(LabelKind),
  value: Schema.Union(Schema.BigIntFromSelf, Schema.String)
}) {
  toJSON() {
    return {
      _tag: "Label" as const,
      kind: this.kind === LabelKind.Int ? "Int" : "Text",
      value: this.kind === LabelKind.Int ? this.value.toString() : this.value
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
      that instanceof Label &&
      this.kind === that.kind &&
      (this.kind === LabelKind.Int && that.kind === LabelKind.Int
        ? this.value === that.value
        : this.value === that.value)
    )
  }

  [Hash.symbol](): number {
    return Hash.combine(Hash.number(this.kind))(
      typeof this.value === "bigint" ? Hash.number(Number(this.value)) : Hash.string(this.value as string)
    )
  }

  /**
   * Get the integer value (throws if label is text).
   *
   * @since 2.0.0
   * @category Accessors
   */
  asInt(): bigint {
    if (this.kind !== LabelKind.Int) {
      throw new Error("Label is not an integer")
    }
    return this.value as bigint
  }

  /**
   * Get the text value (throws if label is integer).
   *
   * @since 2.0.0
   * @category Accessors
   */
  asText(): string {
    if (this.kind !== LabelKind.Text) {
      throw new Error("Label is not text")
    }
    return this.value as string
  }
}

/**
 * Create a Label from an integer.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const labelFromInt = (value: bigint): Label =>
  new Label({ kind: LabelKind.Int, value }, { disableValidation: true })

/**
 * Create a Label from a text string.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const labelFromText = (value: string): Label =>
  new Label({ kind: LabelKind.Text, value }, { disableValidation: true })

/**
 * Create a Label from AlgorithmId.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const labelFromAlgorithmId = (alg: AlgorithmId): Label => labelFromInt(BigInt(alg))

/**
 * Create a Label from KeyType.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const labelFromKeyType = (kty: KeyType): Label => labelFromInt(BigInt(kty))

/**
 * Create a Label from CurveType.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const labelFromCurveType = (crv: CurveType): Label => labelFromInt(BigInt(crv))

// ============================================================================
// HeaderMap
// ============================================================================

/**
 * Map of COSE header labels to values (RFC 8152).
 *
 * @since 2.0.0
 * @category Model
 */
export class HeaderMap extends Schema.Class<HeaderMap>("HeaderMap")({
  headers: Schema.ReadonlyMapFromSelf({
    key: Schema.instanceOf(Label),
    value: Schema.Any
  })
}) {
  toJSON() {
    const entries = Array.from(this.headers.entries()).map(([label, value]) => [label.toJSON(), value])
    return { _tag: "HeaderMap" as const, headers: entries }
  }

  toString(): string {
    return Inspectable.format(this.toJSON())
  }

  [Inspectable.NodeInspectSymbol](): unknown {
    return this.toJSON()
  }

  [Equal.symbol](that: unknown): boolean {
    if (!(that instanceof HeaderMap)) return false
    if (this.headers.size !== that.headers.size) return false
    for (const [key, value] of this.headers.entries()) {
      const otherValue = that.headers.get(key)
      if (otherValue === undefined || !Equal.equals(value, otherValue)) return false
    }
    return true
  }

  [Hash.symbol](): number {
    let hash = Hash.hash("HeaderMap")
    for (const [key, value] of this.headers.entries()) {
      hash = Hash.combine(hash)(Hash.combine(Hash.hash(key))(Hash.hash(value)))
    }
    return hash
  }

  /**
   * Set algorithm identifier header.
   *
   * @since 2.0.0
   * @category Mutators
   */
  setAlgorithmId(alg: AlgorithmId): this {
    const newHeaders = new Map(this.headers)
    newHeaders.set(labelFromInt(1n), BigInt(alg))
    return new HeaderMap({ headers: newHeaders }, { disableValidation: true }) as this
  }

  /**
   * Get algorithm identifier header.
   *
   * @since 2.0.0
   * @category Accessors
   */
  algorithmId(): AlgorithmId | undefined {
    const targetLabel = labelFromInt(1n)
    for (const [label, value] of this.headers.entries()) {
      if (Equal.equals(label, targetLabel)) {
        return value !== undefined ? Number(value) : undefined
      }
    }
    return undefined
  }

  /**
   * Set key ID header.
   *
   * @since 2.0.0
   * @category Mutators
   */
  setKeyId(kid: Uint8Array): this {
    const newHeaders = new Map(this.headers)
    newHeaders.set(labelFromInt(4n), kid)
    return new HeaderMap({ headers: newHeaders }, { disableValidation: true }) as this
  }

  /**
   * Get key ID header.
   *
   * @since 2.0.0
   * @category Accessors
   */
  keyId(): Uint8Array | undefined {
    const targetLabel = labelFromInt(4n)
    for (const [label, value] of this.headers.entries()) {
      if (Equal.equals(label, targetLabel)) {
        return value instanceof Uint8Array ? value : undefined
      }
    }
    return undefined
  }

  /**
   * Set custom header.
   *
   * @since 2.0.0
   * @category Mutators
   */
  setHeader(label: Label, value: CBOR.CBOR): this {
    const newHeaders = new Map(this.headers)
    newHeaders.set(label, value)
    return new HeaderMap({ headers: newHeaders }, { disableValidation: true }) as this
  }

  /**
   * Get custom header.
   *
   * @since 2.0.0
   * @category Accessors
   */
  header(label: Label): CBOR.CBOR | undefined {
    return this.headers.get(label)
  }

  /**
   * Get all header label keys.
   *
   * @since 2.0.0
   * @category Accessors
   */
  keys(): ReadonlyArray<Label> {
    return Array.from(this.headers.keys())
  }
}

/**
 * Create an empty HeaderMap.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const headerMapNew = (): HeaderMap =>
  new HeaderMap({ headers: new Map<Label, CBOR.CBOR>() }, { disableValidation: true })

/**
 * CBOR bytes transformation schema for HeaderMap.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const HeaderMapFromCBORBytes = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  Schema.transformOrFail(
    CBOR.FromBytes(options),
    Schema.typeSchema(HeaderMap),
    {
      strict: true,
      decode: (cbor, _, ast) => {
        if (!(cbor instanceof Map)) {
          return ParseResult.fail(new ParseResult.Type(ast, cbor))
        }
        const headers = new Map<Label, CBOR.CBOR>()
        for (const [key, value] of cbor.entries()) {
          let label: Label
          if (typeof key === "bigint") {
            label = labelFromInt(key)
          } else if (typeof key === "string") {
            label = labelFromText(key)
          } else {
            return ParseResult.fail(new ParseResult.Type(ast, key))
          }
          headers.set(label, value)
        }
        return ParseResult.succeed(new HeaderMap({ headers }, { disableValidation: true }))
      },
      encode: (headerMap) => {
        const cborMap = new Map<CBOR.CBOR, CBOR.CBOR>()
        for (const [label, value] of headerMap.headers.entries()) {
          cborMap.set(label.value, value)
        }
        return ParseResult.succeed(cborMap)
      }
    }
  ).annotations({
    identifier: "HeaderMap.FromCBORBytes",
    description: "Transforms CBOR bytes to HeaderMap"
  })

/**
 * CBOR hex transformation schema for HeaderMap.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const HeaderMapFromCBORHex = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  Schema.compose(Bytes.FromHex, HeaderMapFromCBORBytes(options)).annotations({
    identifier: "HeaderMap.FromCBORHex",
    description: "Transforms CBOR hex string to HeaderMap"
  })

/**
 * Decode HeaderMap from CBOR bytes.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const headerMapFromCBORBytes = (bytes: Uint8Array, options?: CBOR.CodecOptions): HeaderMap =>
  Schema.decodeSync(HeaderMapFromCBORBytes(options))(bytes)

/**
 * Decode HeaderMap from CBOR hex.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const headerMapFromCBORHex = (hex: string, options?: CBOR.CodecOptions): HeaderMap =>
  Schema.decodeSync(HeaderMapFromCBORHex(options))(hex)

/**
 * Encode HeaderMap to CBOR bytes.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const headerMapToCBORBytes = (headerMap: HeaderMap, options?: CBOR.CodecOptions): Uint8Array =>
  Schema.encodeSync(HeaderMapFromCBORBytes(options))(headerMap)

/**
 * Encode HeaderMap to CBOR hex.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const headerMapToCBORHex = (headerMap: HeaderMap, options?: CBOR.CodecOptions): string =>
  Schema.encodeSync(HeaderMapFromCBORHex(options))(headerMap)

// ============================================================================
// Headers
// ============================================================================

/**
 * COSE protected and unprotected headers (RFC 8152).
 *
 * @since 2.0.0
 * @category Model
 */
export class Headers extends Schema.Class<Headers>("Headers")({
  protected: Schema.instanceOf(HeaderMap),
  unprotected: Schema.instanceOf(HeaderMap)
}) {
  toJSON() {
    return {
      _tag: "Headers" as const,
      protected: this.protected.toJSON(),
      unprotected: this.unprotected.toJSON()
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
      that instanceof Headers && Equal.equals(this.protected, that.protected) && Equal.equals(this.unprotected, that.unprotected)
    )
  }

  [Hash.symbol](): number {
    return Hash.combine(Hash.hash(this.protected))(Hash.hash(this.unprotected))
  }
}

/**
 * Create Headers with protected and unprotected maps.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const headersNew = (protectedHeaders: HeaderMap, unprotectedHeaders: HeaderMap): Headers =>
  new Headers({ protected: protectedHeaders, unprotected: unprotectedHeaders }, { disableValidation: true })

// ============================================================================
// COSEKey
// ============================================================================

/**
 * COSE key representation (RFC 8152).
 *
 * @since 2.0.0
 * @category Model
 */
export class COSEKey extends Schema.Class<COSEKey>("COSEKey")({
  keyType: Schema.UndefinedOr(Schema.Enums(KeyType)),
  keyId: Schema.UndefinedOr(Schema.Uint8ArrayFromSelf),
  algorithmId: Schema.UndefinedOr(Schema.Enums(AlgorithmId)),
  keyOps: Schema.UndefinedOr(Schema.Array(Schema.Enums(KeyOperation))),
  baseInitVector: Schema.UndefinedOr(Schema.Uint8ArrayFromSelf),
  headers: Schema.instanceOf(HeaderMap)
}) {
  toJSON() {
    return {
      _tag: "COSEKey" as const,
      keyType: this.keyType !== undefined ? KeyType[this.keyType] : undefined,
      keyId: this.keyId !== undefined ? Bytes.toHex(this.keyId) : undefined,
      algorithmId: this.algorithmId !== undefined ? AlgorithmId[this.algorithmId] : undefined,
      keyOps:
        this.keyOps !== undefined ? this.keyOps.map((op: KeyOperation) => KeyOperation[op]) : undefined,
      baseInitVector:
        this.baseInitVector !== undefined ? Bytes.toHex(this.baseInitVector) : undefined,
      headers: this.headers.toJSON()
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
      that instanceof COSEKey &&
      Equal.equals(this.keyType, that.keyType) &&
      Equal.equals(this.keyId, that.keyId) &&
      Equal.equals(this.algorithmId, that.algorithmId) &&
      Equal.equals(this.keyOps, that.keyOps) &&
      Equal.equals(this.baseInitVector, that.baseInitVector) &&
      Equal.equals(this.headers, that.headers)
    )
  }

  [Hash.symbol](): number {
    return Hash.combine(
      Hash.combine(
        Hash.combine(
          Hash.combine(Hash.combine(Hash.hash(this.keyType))(Hash.hash(this.keyId)))(
            Hash.hash(this.algorithmId)
          )
        )(Hash.hash(this.keyOps))
      )(Hash.hash(this.baseInitVector))
    )(Hash.hash(this.headers))
  }
}

/**
 * CBOR bytes transformation schema for COSEKey.
 * Encodes COSEKey as a CBOR Map compatible with CSL/lucid-evolution.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const COSEKeyFromCBORBytes = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  Schema.transformOrFail(
    CBOR.FromBytes(options),
    Schema.typeSchema(COSEKey),
    {
      strict: true,
      decode: (cbor, _, ast) => {
        // COSEKey is encoded as a CBOR Map
        if (!(cbor instanceof Map)) {
          return ParseResult.fail(new ParseResult.Type(ast, cbor))
        }
        
        // Decode standard COSE parameters and custom headers
        let keyType: KeyType | undefined
        let keyId: Uint8Array | undefined
        let algorithmId: AlgorithmId | undefined
        let keyOps: Array<KeyOperation> | undefined
        let baseInitVector: Uint8Array | undefined
        const customHeaders = new Map<Label, CBOR.CBOR>()

        for (const [labelValue, value] of cbor.entries()) {
          // Convert CBOR value to Label
          const label = typeof labelValue === "bigint" ? labelFromInt(labelValue) :
            typeof labelValue === "string" ? labelFromText(labelValue) : labelFromInt(BigInt(labelValue))
          
          // Standard COSE key parameters
          if (Equal.equals(label, labelFromInt(1n))) { // kty
            keyType = Number(value) as KeyType
          } else if (Equal.equals(label, labelFromInt(2n))) { // kid
            keyId = value as Uint8Array
          } else if (Equal.equals(label, labelFromInt(3n))) { // alg
            algorithmId = Number(value) as AlgorithmId
          } else if (Equal.equals(label, labelFromInt(4n))) { // key_ops
            keyOps = (value as Array<unknown>).map(op => Number(op) as KeyOperation)
          } else if (Equal.equals(label, labelFromInt(5n))) { // Base IV
            baseInitVector = value as Uint8Array
          } else {
            // Custom headers (curve, public key, etc.)
            customHeaders.set(label, value)
          }
        }

        const headers = new HeaderMap({ headers: customHeaders }, { disableValidation: true })
        
        return ParseResult.succeed(
          new COSEKey(
            { keyType, keyId, algorithmId, keyOps, baseInitVector, headers },
            { disableValidation: true }
          )
        )
      },
      encode: (coseKey) => {
        const map = new Map<CBOR.CBOR, CBOR.CBOR>()
        
        // Encode standard COSE parameters
        if (coseKey.keyType !== undefined) map.set(1n, BigInt(coseKey.keyType))
        if (coseKey.keyId !== undefined) map.set(2n, coseKey.keyId)
        if (coseKey.algorithmId !== undefined) map.set(3n, BigInt(coseKey.algorithmId))
        if (coseKey.keyOps !== undefined) {
          map.set(4n, coseKey.keyOps.map(op => BigInt(op)))
        }
        if (coseKey.baseInitVector !== undefined) map.set(5n, coseKey.baseInitVector)
        
        // Encode custom headers
        for (const [label, value] of coseKey.headers.headers.entries()) {
          map.set(label.value, value)
        }
        
        return ParseResult.succeed(map)
      }
    }
  ).annotations({ identifier: "COSEKeyFromCBORBytes" })

// ============================================================================
// EdDSA25519Key
// ============================================================================

/**
 * Ed25519 key for signing and verification.
 *
 * @since 2.0.0
 * @category Model
 */
export class EdDSA25519Key extends Schema.Class<EdDSA25519Key>("EdDSA25519Key")({
  privateKey: Schema.UndefinedOr(Schema.instanceOf(PrivateKey.PrivateKey)),
  publicKey: Schema.UndefinedOr(Schema.instanceOf(VKey.VKey))
}) {
  toJSON() {
    return {
      _tag: "EdDSA25519Key" as const,
      hasPrivateKey: this.privateKey !== undefined,
      hasPublicKey: this.publicKey !== undefined
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
      that instanceof EdDSA25519Key &&
      Equal.equals(this.privateKey, that.privateKey) &&
      Equal.equals(this.publicKey, that.publicKey)
    )
  }

  [Hash.symbol](): number {
    return Hash.combine(Hash.hash(this.privateKey))(Hash.hash(this.publicKey))
  }

  /**
   * Set the private key for signing.
   *
   * @since 2.0.0
   * @category Mutators
   */
  setPrivateKey(privateKey: PrivateKey.PrivateKey): this {
    return new EdDSA25519Key(
      {
        privateKey,
        publicKey: VKey.fromPrivateKey(privateKey)
      },
      { disableValidation: true }
    ) as this
  }

  /**
   * Check if key can be used for signing.
   *
   * @since 2.0.0
   * @category Predicates
   */
  isForSigning(): boolean {
    return this.privateKey !== undefined
  }

  /**
   * Check if key can be used for verification.
   *
   * @since 2.0.0
   * @category Predicates
   */
  isForVerifying(): boolean {
    return this.publicKey !== undefined
  }

  /**
   * Build a COSEKey from this Ed25519 key.
   *
   * @since 2.0.0
   * @category Conversion
   */
  build(): COSEKey {
    const headers = headerMapNew()
      .setAlgorithmId(AlgorithmId.EdDSA)
      .setHeader(labelFromInt(1n), BigInt(KeyType.OKP))
      .setHeader(labelFromInt(-1n), BigInt(CurveType.Ed25519))

    const headersWithKey =
      this.publicKey !== undefined
        ? headers.setHeader(labelFromInt(-2n), this.publicKey.bytes)
        : headers

    return new COSEKey(
      {
        keyType: KeyType.OKP,
        keyId: undefined,
        algorithmId: AlgorithmId.EdDSA,
        keyOps: undefined,
        baseInitVector: undefined,
        headers: headersWithKey
      },
      { disableValidation: true }
    )
  }
}

// ============================================================================
// COSESign1
// ============================================================================

/**
 * COSE_Sign1 structure (RFC 8152) - signed message.
 *
 * @since 2.0.0
 * @category Model
 */
export class COSESign1 extends Schema.Class<COSESign1>("COSESign1")({
  headers: Schema.instanceOf(Headers),
  payload: Schema.UndefinedOr(Schema.Uint8ArrayFromSelf),
  signature: Schema.instanceOf(Ed25519Signature.Ed25519Signature)
}) {
  toJSON() {
    return {
      _tag: "COSESign1" as const,
      headers: this.headers.toJSON(),
      payload: this.payload !== undefined ? Bytes.toHex(this.payload) : undefined,
      signature: Bytes.toHex(this.signature.bytes)
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
      that instanceof COSESign1 &&
      Equal.equals(this.headers, that.headers) &&
      Equal.equals(this.payload, that.payload) &&
      Equal.equals(this.signature, that.signature)
    )
  }

  [Hash.symbol](): number {
    return Hash.combine(Hash.combine(Hash.hash(this.headers))(Hash.hash(this.payload)))(
      Hash.hash(this.signature)
    )
  }

  /**
   * Get the signed data (Sig_structure as per RFC 8152).
   *
   * @since 2.0.0
   * @category Accessors
   */
  signedData(externalAad: Uint8Array = new Uint8Array()): Uint8Array {
    // Encode protected headers to CBOR
    const protectedCbor = this.headers.protected.headers.size === 0 ? new Map() : new Map(
      Array.from(this.headers.protected.headers.entries()).map(([label, value]) => [label.value, value])
    )
    const protectedBytes = Schema.encodeSync(CBOR.FromBytes(CBOR.CML_DEFAULT_OPTIONS))(protectedCbor)

    // Create Sig_structure: ["Signature1", protected, external_aad, payload]
    const sigStructure: CBOR.CBOR = [
      "Signature1",
      protectedBytes,
      externalAad,
      this.payload !== undefined ? this.payload : new Uint8Array()
    ]

    return Schema.encodeSync(CBOR.FromBytes(CBOR.CML_DEFAULT_OPTIONS))(sigStructure)
  }
}

/**
 * CBOR bytes transformation schema for COSESign1.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const COSESign1FromCBORBytes = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  Schema.transformOrFail(
    CBOR.FromBytes(options),
    Schema.typeSchema(COSESign1),
    {
      strict: true,
      decode: (cbor, _, ast) => {
        // COSE_Sign1 = [ protected, unprotected, payload, signature ]
        if (!Array.isArray(cbor) || cbor.length !== 4) {
          return ParseResult.fail(new ParseResult.Type(ast, cbor))
        }

        const [protectedBytes, unprotectedCbor, payloadCbor, signatureBytes] = cbor

        // Decode protected headers
        if (!(protectedBytes instanceof Uint8Array)) {
          return ParseResult.fail(new ParseResult.Type(ast, protectedBytes))
        }
        const protectedResult = Schema.decodeUnknownEither(HeaderMapFromCBORBytes(options))(
          protectedBytes
        )
        if (protectedResult._tag === "Left") {
          return ParseResult.fail(new ParseResult.Type(ast, protectedBytes))
        }

        // Decode unprotected headers (should be a Map directly, not bytes)
        if (!(unprotectedCbor instanceof Map)) {
          return ParseResult.fail(new ParseResult.Type(ast, unprotectedCbor))
        }
        const unprotectedHeaders = new Map<Label, CBOR.CBOR>()
        for (const [key, value] of unprotectedCbor.entries()) {
          let label: Label
          if (typeof key === "bigint") {
            label = labelFromInt(key)
          } else if (typeof key === "string") {
            label = labelFromText(key)
          } else {
            return ParseResult.fail(new ParseResult.Type(ast, key))
          }
          unprotectedHeaders.set(label, value)
        }
        const unprotectedResult = { right: new HeaderMap({ headers: unprotectedHeaders }, { disableValidation: true }) }

        // Decode payload
        let payload: Uint8Array | undefined
        if (payloadCbor === null || payloadCbor === undefined) {
          payload = undefined
        } else if (payloadCbor instanceof Uint8Array) {
          payload = payloadCbor
        } else {
          return ParseResult.fail(new ParseResult.Type(ast, payloadCbor))
        }

        // Decode signature
        if (!(signatureBytes instanceof Uint8Array) || signatureBytes.length !== 64) {
          return ParseResult.fail(new ParseResult.Type(ast, signatureBytes))
        }
        const signature = new Ed25519Signature.Ed25519Signature(
          { bytes: signatureBytes },
          { disableValidation: true }
        )

        const headers = headersNew(protectedResult.right, unprotectedResult.right)
        return ParseResult.succeed(
          new COSESign1({ headers, payload, signature }, { disableValidation: true })
        )
      },
      encode: (coseSign1) => {
        // Encode protected headers to bytes
        const protectedBytes = Schema.encodeSync(HeaderMapFromCBORBytes(options))(
          coseSign1.headers.protected
        )

        // Encode unprotected headers to Map (not bytes!)
        const unprotectedCbor = new Map<CBOR.CBOR, CBOR.CBOR>()
        for (const [label, value] of coseSign1.headers.unprotected.headers.entries()) {
          unprotectedCbor.set(label.value, value)
        }

        // Encode payload
        const payloadCbor = coseSign1.payload !== undefined ? coseSign1.payload : null

        // Get signature bytes
        const signatureBytes = coseSign1.signature.bytes

        return ParseResult.succeed([protectedBytes, unprotectedCbor, payloadCbor, signatureBytes])
      }
    }
  ).annotations({
    identifier: "COSESign1.FromCBORBytes",
    description: "Transforms CBOR bytes to COSESign1"
  })

/**
 * CBOR hex transformation schema for COSESign1.
 *
 * @since 2.0.0
 * @category Schemas
 */
export const COSESign1FromCBORHex = (options: CBOR.CodecOptions = CBOR.CML_DEFAULT_OPTIONS) =>
  Schema.compose(Bytes.FromHex, COSESign1FromCBORBytes(options)).annotations({
    identifier: "COSESign1.FromCBORHex",
    description: "Transforms CBOR hex string to COSESign1"
  })

// ============================================================================
// COSESign1Builder
// ============================================================================

/**
 * Builder for creating COSE_Sign1 structures.
 *
 * @since 2.0.0
 * @category Model
 */
export class COSESign1Builder extends Schema.Class<COSESign1Builder>("COSESign1Builder")({
  headers: Schema.instanceOf(Headers),
  payload: Schema.Uint8ArrayFromSelf,
  hashPayload: Schema.Boolean,
  externalAad: Schema.Uint8ArrayFromSelf
}) {
  toJSON() {
    return {
      _tag: "COSESign1Builder" as const,
      headers: this.headers.toJSON(),
      payload: Bytes.toHex(this.payload),
      hashPayload: this.hashPayload,
      externalAad: Bytes.toHex(this.externalAad)
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
      that instanceof COSESign1Builder &&
      Equal.equals(this.headers, that.headers) &&
      Bytes.bytesEquals(this.payload, that.payload) &&
      this.hashPayload === that.hashPayload &&
      Bytes.bytesEquals(this.externalAad, that.externalAad)
    )
  }

  [Hash.symbol](): number {
    return Hash.combine(
      Hash.combine(Hash.combine(Hash.hash(this.headers))(Hash.array(Array.from(this.payload))))(
        Hash.hash(this.hashPayload)
      )
    )(Hash.array(Array.from(this.externalAad)))
  }

  /**
   * Set external additional authenticated data.
   *
   * @since 2.0.0
   * @category Mutators
   */
  setExternalAad(aad: Uint8Array): this {
    return new COSESign1Builder(
      {
        headers: this.headers,
        payload: this.payload,
        hashPayload: this.hashPayload,
        externalAad: aad
      },
      { disableValidation: true }
    ) as this
  }

  /**
   * Create the data that needs to be signed (Sig_structure).
   *
   * @since 2.0.0
   * @category Building
   */
  makeDataToSign(): Uint8Array {
    // Encode protected headers to CBOR map
    const protectedCbor = new Map(
      Array.from(this.headers.protected.headers.entries()).map(([label, value]) => [label.value, value])
    )
    const protectedBytes = Schema.encodeSync(CBOR.FromBytes(CBOR.CML_DEFAULT_OPTIONS))(protectedCbor)

    // Use payload directly or hash it
    const payloadToSign = this.hashPayload ? this.payload : this.payload

    // Create Sig_structure: ["Signature1", protected, external_aad, payload]
    const sigStructure: CBOR.CBOR = ["Signature1", protectedBytes, this.externalAad, payloadToSign]

    return Schema.encodeSync(CBOR.FromBytes(CBOR.CML_DEFAULT_OPTIONS))(sigStructure)
  }

  /**
   * Build the final COSESign1 structure with the provided signature.
   *
   * @since 2.0.0
   * @category Building
   */
  build(signature: Ed25519Signature.Ed25519Signature): COSESign1 {
    return new COSESign1(
      {
        headers: this.headers,
        payload: this.payload,
        signature
      },
      { disableValidation: true }
    )
  }
}

/**
 * Create a new COSESign1Builder.
 *
 * @since 2.0.0
 * @category Constructors
 */
export const coseSign1BuilderNew = (
  headers: Headers,
  payload: Uint8Array,
  hashPayload: boolean
): COSESign1Builder =>
  new COSESign1Builder(
    {
      headers,
      payload,
      hashPayload,
      externalAad: new Uint8Array()
    },
    { disableValidation: true }
  )

// ============================================================================
// High-Level API
// ============================================================================

/**
 * Payload type - raw binary data to be signed.
 *
 * @since 2.0.0
 * @category Types
 */
export type Payload = Uint8Array

/**
 * Signed message result.
 *
 * @since 2.0.0
 * @category Types
 */
export type SignedMessage = {
  readonly signature: Uint8Array
  readonly key: Uint8Array
}

/**
 * Sign data with a private key using COSE_Sign1.
 * Compatible with lucid-evolution's sign_data implementation.
 *
 * @since 2.0.0
 * @category API
 */
export const signData = (
  addressHex: string,
  payload: Payload,
  privateKey: PrivateKey.PrivateKey
): SignedMessage => {
  // Create headers with algorithm and address (in protected headers like lucid-evolution)
  const protectedHeaders = headerMapNew()
    .setAlgorithmId(AlgorithmId.EdDSA)
    .setHeader(labelFromText("address"), Bytes.fromHex(addressHex))
  // Add "hashed": false to unprotected headers (lucid-evolution compatibility)
  const unprotectedHeaders = headerMapNew().setHeader(labelFromText("hashed"), false)
  const headers = headersNew(protectedHeaders, unprotectedHeaders)

  // Create builder
  const builder = coseSign1BuilderNew(headers, payload, false)

  // Create data to sign
  const dataToSign = builder.makeDataToSign()

  // Sign with private key
  const signature = PrivateKey.sign(privateKey, dataToSign)

  // Build COSESign1
  const coseSign1 = builder.build(signature)

  // Encode to CBOR bytes
  const signedBytes = Schema.encodeSync(COSESign1FromCBORBytes())(coseSign1)

  // Build COSEKey compatible with lucid-evolution
  const vkey = VKey.fromPrivateKey(privateKey)
  const ed25519Key = new EdDSA25519Key({ privateKey: undefined, publicKey: vkey }, { disableValidation: true })
  const coseKey = ed25519Key.build()
  const keyBytes = Schema.encodeSync(COSEKeyFromCBORBytes())(coseKey)

  return {
    signature: signedBytes,
    key: keyBytes
  }
}

/**
 * Verify a COSE_Sign1 signed message.
 * Compatible with lucid-evolution's verifyData implementation.
 *
 * @since 2.0.0
 * @category API
 */
export const verifyData = (
  addressHex: string,
  keyHash: string,
  payload: Payload,
  signedMessage: SignedMessage
): boolean => {
  try {
    // Decode COSESign1 from signature bytes
    const coseSign1 = Schema.decodeSync(COSESign1FromCBORBytes())(signedMessage.signature)

    // Verify payload matches (allow empty payloads)
    if (coseSign1.payload === undefined) return false
    if (!Bytes.bytesEquals(coseSign1.payload, payload)) return false

    // Get protected headers
    const addressLabel = labelFromText("address")
    let addressInSignature: CBOR.CBOR | undefined
    for (const [label, value] of coseSign1.headers.protected.headers.entries()) {
      if (Equal.equals(label, addressLabel)) {
        addressInSignature = value
        break
      }
    }
    if (addressInSignature === undefined) return false
    if (!(addressInSignature instanceof Uint8Array)) return false
    if (Bytes.toHex(addressInSignature) !== addressHex) return false

    // Get algorithm ID from protected headers
    const algorithmId = coseSign1.headers.protected.algorithmId()
    if (algorithmId === undefined) return false
    if (algorithmId !== AlgorithmId.EdDSA) return false

    // Decode COSEKey and extract public key
    const coseKey = Schema.decodeSync(COSEKeyFromCBORBytes())(signedMessage.key)
    
    // Extract public key from COSEKey headers (parameter -2)
    const pubKeyLabel = labelFromInt(-2n)
    let publicKeyBytes: Uint8Array | undefined
    for (const [label, value] of coseKey.headers.headers.entries()) {
      if (Equal.equals(label, pubKeyLabel)) {
        publicKeyBytes = value as Uint8Array
        break
      }
    }
    if (publicKeyBytes === undefined) return false
    
    const publicKey = VKey.fromBytes(publicKeyBytes)
    const publicKeyHash = KeyHash.fromVKey(publicKey)
    if (KeyHash.toHex(publicKeyHash) !== keyHash) return false

    // Get signed data
    const signedData = coseSign1.signedData()

    // Verify signature
    return VKey.verify(publicKey, signedData, coseSign1.signature.bytes)
  } catch {
    return false
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Convert text to Payload (UTF-8 encoding).
 *
 * @since 2.0.0
 * @category Utilities
 */
export const fromText = (text: string): Payload => new TextEncoder().encode(text)

/**
 * Convert Payload to text (UTF-8 decoding).
 *
 * @since 2.0.0
 * @category Utilities
 */
export const toText = (payload: Payload): string => new TextDecoder().decode(payload)

/**
 * Convert hex string to Payload.
 *
 * @since 2.0.0
 * @category Utilities
 */
export const fromHex = (hex: string): Payload => Bytes.fromHex(hex)

/**
 * Convert Payload to hex string.
 *
 * @since 2.0.0
 * @category Utilities
 */
export const toHex = (payload: Payload): string => Bytes.toHex(payload)

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Decode COSESign1 from CBOR bytes.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const coseSign1FromCBORBytes = (bytes: Uint8Array, options?: CBOR.CodecOptions): COSESign1 =>
  Schema.decodeSync(COSESign1FromCBORBytes(options))(bytes)

/**
 * Decode COSESign1 from CBOR hex.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const coseSign1FromCBORHex = (hex: string, options?: CBOR.CodecOptions): COSESign1 =>
  Schema.decodeSync(COSESign1FromCBORHex(options))(hex)

/**
 * Encode COSESign1 to CBOR bytes.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const coseSign1ToCBORBytes = (coseSign1: COSESign1, options?: CBOR.CodecOptions): Uint8Array =>
  Schema.encodeSync(COSESign1FromCBORBytes(options))(coseSign1)

/**
 * Encode COSESign1 to CBOR hex.
 *
 * @since 2.0.0
 * @category Conversion
 */
export const coseSign1ToCBORHex = (coseSign1: COSESign1, options?: CBOR.CodecOptions): string =>
  Schema.encodeSync(COSESign1FromCBORHex(options))(coseSign1)

// ============================================================================
// Testing Support
// ============================================================================

/**
 * FastCheck arbitrary for generating random Payload instances.
 *
 * @since 2.0.0
 * @category Testing
 */
export const arbitraryPayload: FastCheck.Arbitrary<Payload> = FastCheck.uint8Array({
  minLength: 0,
  maxLength: 256
})
