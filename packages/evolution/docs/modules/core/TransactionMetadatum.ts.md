---
title: core/TransactionMetadatum.ts
nav_order: 131
parent: Modules
---

## TransactionMetadatum overview

---

<h2 class="text-delta">Table of contents</h2>

- [constructors](#constructors)
  - [array](#array)
  - [bytes](#bytes)
  - [int](#int)
  - [map](#map)
  - [text](#text)
- [effect](#effect)
  - [Either (namespace)](#either-namespace)
- [encoding](#encoding)
  - [toCBORBytes](#tocborbytes)
  - [toCBORHex](#tocborhex)
- [errors](#errors)
  - [TransactionMetadatumError (class)](#transactionmetadatumerror-class)
- [model](#model)
  - [List (type alias)](#list-type-alias)
  - [Map (type alias)](#map-type-alias)
  - [TransactionMetadatum (type alias)](#transactionmetadatum-type-alias)
  - [TransactionMetadatumEncoded (type alias)](#transactionmetadatumencoded-type-alias)
- [parsing](#parsing)
  - [fromCBORBytes](#fromcborbytes)
  - [fromCBORHex](#fromcborhex)
- [schemas](#schemas)
  - [BytesSchema](#bytesschema)
  - [FromCBORBytes](#fromcborbytes-1)
  - [FromCBORHex](#fromcborhex-1)
  - [IntSchema](#intschema)
  - [ListSchema](#listschema)
  - [MapSchema](#mapschema)
  - [TextSchema](#textschema)
  - [TransactionMetadatumSchema](#transactionmetadatumschema)
- [utilities](#utilities)
  - [equals](#equals)
- [utils](#utils)
  - [arbitrary](#arbitrary)

---

# constructors

## array

Create an array TransactionMetadatum from an array of TransactionMetadatum values.

**Signature**

```ts
export declare const array: (value: Array<TransactionMetadatum>) => List
```

Added in v2.0.0

## bytes

Create a bytes TransactionMetadatum from a Uint8Array value.

**Signature**

```ts
export declare const bytes: (value: Uint8Array) => Uint8Array
```

Added in v2.0.0

## int

Create an integer TransactionMetadatum from a bigint value.

**Signature**

```ts
export declare const int: (value: bigint) => bigint
```

Added in v2.0.0

## map

Create a map TransactionMetadatum from a Map of TransactionMetadatum key-value pairs.

**Signature**

```ts
export declare const map: (value: globalThis.Map<TransactionMetadatum, TransactionMetadatum>) => Map
```

Added in v2.0.0

## text

Create a text TransactionMetadatum from a string value.

**Signature**

```ts
export declare const text: (value: string) => string
```

Added in v2.0.0

# effect

## Either (namespace)

Effect-based error handling variants for functions that can fail.

Added in v2.0.0

# encoding

## toCBORBytes

Convert a TransactionMetadatum to CBOR bytes.

**Signature**

```ts
export declare const toCBORBytes: (input: TransactionMetadatum, options?: CBOR.CodecOptions) => Uint8Array
```

Added in v2.0.0

## toCBORHex

Convert a TransactionMetadatum to CBOR hex string.

**Signature**

```ts
export declare const toCBORHex: (input: TransactionMetadatum, options?: CBOR.CodecOptions) => string
```

Added in v2.0.0

# errors

## TransactionMetadatumError (class)

Error class for transaction metadatum related operations.

**Signature**

```ts
export declare class TransactionMetadatumError
```

Added in v2.0.0

# model

## List (type alias)

TransactionMetadatumList type alias

**Signature**

```ts
export type List = ReadonlyArray<TransactionMetadatum>
```

Added in v2.0.0

## Map (type alias)

TransactionMetadatumMap type alias

**Signature**

```ts
export type Map = globalThis.Map<TransactionMetadatum, TransactionMetadatum>
```

Added in v2.0.0

## TransactionMetadatum (type alias)

Transaction metadata type definition (runtime type).

Transaction metadata supports text strings, integers, byte arrays, arrays, and maps.
Following CIP-10 standard metadata registry.

**Signature**

```ts
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
```

Added in v2.0.0

## TransactionMetadatumEncoded (type alias)

Encoded type for transaction metadata (wire format with string for bigint)

**Signature**

```ts
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
```

Added in v2.0.0

# parsing

## fromCBORBytes

Parse a TransactionMetadatum from CBOR bytes.

**Signature**

```ts
export declare const fromCBORBytes: (bytes: Uint8Array, options?: CBOR.CodecOptions) => TransactionMetadatum
```

Added in v2.0.0

## fromCBORHex

Parse a TransactionMetadatum from CBOR hex string.

**Signature**

```ts
export declare const fromCBORHex: (hex: string, options?: CBOR.CodecOptions) => TransactionMetadatum
```

Added in v2.0.0

# schemas

## BytesSchema

Schema for TransactionMetadatum bytes type

**Signature**

```ts
export declare const BytesSchema: Schema.Schema<Uint8Array, string, never>
```

Added in v2.0.0

## FromCBORBytes

Schema transformer for TransactionMetadatum from CBOR bytes.

**Signature**

```ts
export declare const FromCBORBytes: (
  options?: CBOR.CodecOptions
) => Schema.transform<
  Schema.transformOrFail<
    typeof Schema.Uint8ArrayFromSelf,
    Schema.declare<CBOR.CBOR, CBOR.CBOR, readonly [], never>,
    never
  >,
  Schema.Schema<TransactionMetadatum, TransactionMetadatumEncoded, never>
>
```

Added in v2.0.0

## FromCBORHex

Schema transformer for TransactionMetadatum from CBOR hex string.

**Signature**

```ts
export declare const FromCBORHex: (
  options?: CBOR.CodecOptions
) => Schema.transform<
  Schema.transform<
    Schema.Schema<Uint8Array, string, never>,
    Schema.transformOrFail<
      typeof Schema.Uint8ArrayFromSelf,
      Schema.declare<CBOR.CBOR, CBOR.CBOR, readonly [], never>,
      never
    >
  >,
  Schema.transform<
    Schema.transformOrFail<
      typeof Schema.Uint8ArrayFromSelf,
      Schema.declare<CBOR.CBOR, CBOR.CBOR, readonly [], never>,
      never
    >,
    Schema.Schema<TransactionMetadatum, TransactionMetadatumEncoded, never>
  >
>
```

Added in v2.0.0

## IntSchema

Schema for TransactionMetadatum integer type

**Signature**

```ts
export declare const IntSchema: Schema.refine<bigint, typeof Schema.BigInt>
```

Added in v2.0.0

## ListSchema

Schema for TransactionMetadatum list type

**Signature**

```ts
export declare const ListSchema: Schema.Schema<List, TransactionMetadatumEncoded, never>
```

Added in v2.0.0

## MapSchema

Schema for TransactionMetadatum map type

**Signature**

```ts
export declare const MapSchema: Schema.Schema<Map, TransactionMetadatumEncoded, never>
```

Added in v2.0.0

## TextSchema

Schema for TransactionMetadatum string type

**Signature**

```ts
export declare const TextSchema: Schema.SchemaClass<string, string, never>
```

Added in v2.0.0

## TransactionMetadatumSchema

Union schema for all types of transaction metadata.

**Signature**

```ts
export declare const TransactionMetadatumSchema: Schema.Schema<TransactionMetadatum, TransactionMetadatumEncoded, never>
```

Added in v2.0.0

# utilities

## equals

Check if two TransactionMetadatum instances are equal.

**Signature**

```ts
export declare const equals: (a: TransactionMetadatum, b: TransactionMetadatum) => boolean
```

Added in v2.0.0

# utils

## arbitrary

**Signature**

```ts
export declare const arbitrary: FastCheck.Arbitrary<TransactionMetadatum>
```
