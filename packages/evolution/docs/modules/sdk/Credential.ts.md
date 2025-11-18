---
title: sdk/Credential.ts
nav_order: 154
parent: Modules
---

## Credential overview

---

<h2 class="text-delta">Table of contents</h2>

- [utils](#utils)
  - [Credential (type alias)](#credential-type-alias)
  - [KeyHash (type alias)](#keyhash-type-alias)
  - [ScriptHash (type alias)](#scripthash-type-alias)
  - [fromCoreCredential](#fromcorecredential)
  - [toCoreCredential](#tocorecredential)

---

# utils

## Credential (type alias)

**Signature**

```ts
export type Credential = typeof CoreCredential.CredentialSchema.Encoded
```

## KeyHash (type alias)

**Signature**

```ts
export type KeyHash = typeof CoreKeyHash.KeyHash.Encoded
```

## ScriptHash (type alias)

**Signature**

```ts
export type ScriptHash = typeof CoreScriptHash.ScriptHash.Encoded
```

## fromCoreCredential

**Signature**

```ts
export declare const fromCoreCredential: (
  a: CoreKeyHash.KeyHash | CoreScriptHash.ScriptHash,
  overrideOptions?: ParseOptions
) => { readonly hash: string; readonly _tag: "KeyHash" } | { readonly hash: string; readonly _tag: "ScriptHash" }
```

## toCoreCredential

**Signature**

```ts
export declare const toCoreCredential: (
  i: { readonly hash: string; readonly _tag: "KeyHash" } | { readonly hash: string; readonly _tag: "ScriptHash" },
  overrideOptions?: ParseOptions
) => CoreKeyHash.KeyHash | CoreScriptHash.ScriptHash
```
