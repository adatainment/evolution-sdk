import * as CSL from "@emurgo/cardano-message-signing-nodejs"
import { FastCheck } from "effect"
import { describe, expect, it } from "vitest"

import * as Ed25519Signature from "../src/core/Ed25519Signature.js"
import * as PrivateKey from "../src/core/PrivateKey.js"
import * as SignData from "../src/core/SignData.js"
import * as VKey from "../src/core/VKey.js"

describe("SignData CSL Primitive Compatibility", () => {
  describe("Enum values", () => {
    it("AlgorithmId.EdDSA has correct value", () => {
      expect(SignData.AlgorithmId.EdDSA).toBe(-8)
    })

    it("KeyType.OKP has correct value", () => {
      expect(SignData.KeyType.OKP).toBe(1)
    })

    it("CurveType.Ed25519 has correct value", () => {
      expect(SignData.CurveType.Ed25519).toBe(6)
    })

    it("KeyOperation enum values match CSL", () => {
      expect(SignData.KeyOperation.Sign).toBe(0)
      expect(SignData.KeyOperation.Verify).toBe(1)
      expect(SignData.KeyOperation.Encrypt).toBe(2)
      expect(SignData.KeyOperation.Decrypt).toBe(3)
      
      expect(SignData.KeyOperation.Sign).toBe(CSL.KeyOperation.Sign)
      expect(SignData.KeyOperation.Verify).toBe(CSL.KeyOperation.Verify)
      expect(SignData.KeyOperation.Encrypt).toBe(CSL.KeyOperation.Encrypt)
      expect(SignData.KeyOperation.Decrypt).toBe(CSL.KeyOperation.Decrypt)
    })
  })

  describe("COSESign1 CBOR encoding", () => {
    it("should decode CSL-encoded COSESign1 structures with exact payload match", () => {
      FastCheck.assert(
        FastCheck.property(
          FastCheck.uint8Array({ minLength: 10, maxLength: 100 }),
          (payload) => {
            const protectedHeaders = CSL.HeaderMap.new()
            protectedHeaders.set_algorithm_id(CSL.Label.from_algorithm_id(CSL.AlgorithmId.EdDSA))
            const protectedSerialized = CSL.ProtectedHeaderMap.new(protectedHeaders)
            const unprotectedHeaders = CSL.HeaderMap.new()
            const headers = CSL.Headers.new(protectedSerialized, unprotectedHeaders)
            
            const signature = new Uint8Array(64).fill(0xab)
            const cslCoseSign1 = CSL.COSESign1.new(headers, payload, signature)
            const cborBytes = cslCoseSign1.to_bytes()

            const decoded = SignData.coseSign1FromCBORBytes(cborBytes)

            expect(decoded.payload).toBeDefined()
            if (decoded.payload !== undefined) {
              expect(Buffer.from(decoded.payload).equals(Buffer.from(payload))).toBe(true)
            }
            expect(Buffer.from(decoded.signature.bytes).equals(Buffer.from(signature))).toBe(true)
          },
        ),
        { numRuns: 50 },
      )
    })

    it("should produce CSL-decodable CBOR with exact roundtrip", () => {
      FastCheck.assert(
        FastCheck.property(
          FastCheck.uint8Array({ minLength: 10, maxLength: 100 }),
          (payload) => {
            const protectedMap = SignData.headerMapNew()
            const protectedWithAlg = protectedMap.setAlgorithmId(SignData.AlgorithmId.EdDSA)
            const unprotectedMap = SignData.headerMapNew()
            const headers = SignData.headersNew(protectedWithAlg, unprotectedMap)
            
            const signature = Ed25519Signature.Ed25519Signature.make({ bytes: new Uint8Array(64).fill(0xcd) })
            const coseSign1 = SignData.COSESign1.make({
              headers,
              payload,
              signature,
            })
            const cborBytes = SignData.coseSign1ToCBORBytes(coseSign1)

            const cslDecoded = CSL.COSESign1.from_bytes(cborBytes)
            const cslPayload = cslDecoded.payload()
            const cslSignature = cslDecoded.signature()
            
            expect(cslPayload).toBeDefined()
            expect(Buffer.from(cslPayload!).equals(Buffer.from(payload))).toBe(true)
            expect(Buffer.from(cslSignature).equals(Buffer.from(signature.bytes))).toBe(true)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe("Label primitives", () => {
    it("should create labels from algorithm IDs compatible with CSL", () => {
      const label = SignData.labelFromAlgorithmId(SignData.AlgorithmId.EdDSA)
      expect(label.kind).toBe(SignData.LabelKind.Int)
      expect(label.value).toBe(-8n)

      const cslLabel = CSL.Label.from_algorithm_id(CSL.AlgorithmId.EdDSA)
      expect(cslLabel).toBeDefined()
    })

    it("should have asInt() and asText() methods matching CSL behavior", () => {
      const intLabel = SignData.labelFromInt(42n)
      expect(intLabel.asInt()).toBe(42n)
      
      const cslIntLabel = CSL.Label.new_int(CSL.Int.new_i32(42))
      const cslInt = cslIntLabel.as_int()
      expect(cslInt).toBeDefined()
      expect(cslInt!.as_i32()).toBe(42)
      
      const textLabel = SignData.labelFromText("custom")
      expect(textLabel.asText()).toBe("custom")
      
      const cslTextLabel = CSL.Label.new_text("custom")
      expect(cslTextLabel.as_text()).toBe("custom")
    })

    it("should create labels from key types compatible with CSL", () => {
      const label = SignData.labelFromKeyType(SignData.KeyType.OKP)
      expect(label.kind).toBe(SignData.LabelKind.Int)
      expect(label.value).toBe(1n)

      const cslLabel = CSL.Label.from_key_type(CSL.KeyType.OKP)
      expect(cslLabel).toBeDefined()
    })

    it("should create text labels", () => {
      const label = SignData.labelFromText("address")
      expect(label.kind).toBe(SignData.LabelKind.Text)
      expect(label.value).toBe("address")
    })

    it("should create int labels", () => {
      const label = SignData.labelFromInt(-2n)
      expect(label.kind).toBe(SignData.LabelKind.Int)
      expect(label.value).toBe(-2n)
    })
  })

  describe("HeaderMap primitives", () => {
    it("should create empty header maps", () => {
      const headerMap = SignData.headerMapNew()
      expect(headerMap).toBeDefined()
      expect(headerMap.headers.size).toBe(0)
    })

    it("should have keys() method matching CSL", () => {
      const headerMap = SignData.headerMapNew()
        .setAlgorithmId(SignData.AlgorithmId.EdDSA)
        .setKeyId(new Uint8Array([1, 2, 3]))
      
      const keys = headerMap.keys()
      expect(keys.length).toBe(2)
      
      const cslHeaderMap = CSL.HeaderMap.new()
      cslHeaderMap.set_algorithm_id(CSL.Label.from_algorithm_id(CSL.AlgorithmId.EdDSA))
      cslHeaderMap.set_key_id(new Uint8Array([1, 2, 3]))
      
      const cslKeys = cslHeaderMap.keys()
      expect(cslKeys.len()).toBe(2)
    })

    it("should set and get algorithm ID with exact value", () => {
      const headerMap = SignData.headerMapNew()
      const updated = headerMap.setAlgorithmId(SignData.AlgorithmId.EdDSA)
      
      const algId = updated.algorithmId()
      expect(algId).toBe(SignData.AlgorithmId.EdDSA)
      expect(algId).toBe(-8)
    })

    it("should set and get key ID with exact bytes", () => {
      const headerMap = SignData.headerMapNew()
      const keyId = new Uint8Array([1, 2, 3, 4])
      const updated = headerMap.setKeyId(keyId)
      
      const retrievedKeyId = updated.keyId()
      expect(retrievedKeyId).toBeDefined()
      expect(Buffer.from(retrievedKeyId!).equals(Buffer.from(keyId))).toBe(true)
      expect(retrievedKeyId!.length).toBe(keyId.length)
      for (let i = 0; i < keyId.length; i++) {
        expect(retrievedKeyId![i]).toBe(keyId[i])
      }
    })

    it("should set and get custom headers with exact CBOR values", () => {
      const headerMap = SignData.headerMapNew()
      const label = SignData.labelFromText("custom")
      const value = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      
      const updated = headerMap.setHeader(label, value)
      const retrieved = updated.header(label)
      
      expect(retrieved).toBeDefined()
      if (retrieved !== undefined && retrieved instanceof Uint8Array) {
        expect(Buffer.from(retrieved).equals(Buffer.from(value))).toBe(true)
      }
    })
  })

  describe("Headers primitives", () => {
    it("should create headers with protected and unprotected maps", () => {
      const protectedMap = SignData.headerMapNew()
      const unprotectedMap = SignData.headerMapNew()
      const headers = SignData.headersNew(protectedMap, unprotectedMap)
      
      expect(headers.protected).toBeDefined()
      expect(headers.unprotected).toBeDefined()
      expect(headers.protected.headers.size).toBe(0)
      expect(headers.unprotected.headers.size).toBe(0)
    })
  })

  describe("COSEKey primitives", () => {
    it("should create COSE keys with required fields exactly matching CSL structure", () => {
      const coseKey = SignData.COSEKey.make({
        keyType: SignData.KeyType.OKP,
        keyId: undefined,
        algorithmId: SignData.AlgorithmId.EdDSA,
        keyOps: undefined,
        baseInitVector: undefined,
        headers: SignData.headerMapNew(),
      })

      expect(coseKey.keyType).toBeDefined()
      expect(coseKey.algorithmId).toBeDefined()
      if (coseKey.keyType !== undefined) {
        expect(coseKey.keyType).toBe(SignData.KeyType.OKP)
        expect(coseKey.keyType).toBe(1)
      }
      if (coseKey.algorithmId !== undefined) {
        expect(coseKey.algorithmId).toBe(SignData.AlgorithmId.EdDSA)
        expect(coseKey.algorithmId).toBe(-8)
      }
    })
  })

  describe("EdDSA25519Key primitives", () => {
    it("should create Ed25519 keys for signing with exact private key", () => {
      const privateKey = PrivateKey.fromHex("a".repeat(64))
      const edKey = SignData.EdDSA25519Key.make({
        privateKey,
        publicKey: undefined,
      })

      expect(edKey.isForSigning()).toBe(true)
      expect(edKey.isForVerifying()).toBe(false)
      expect(edKey.privateKey).toBeDefined()
      expect(edKey.publicKey).toBeUndefined()
    })

    it("should create Ed25519 keys for verifying with exact public key", () => {
      const privateKey = PrivateKey.fromHex("b".repeat(64))
      const publicKey = VKey.fromPrivateKey(privateKey)
      
      const edKey = SignData.EdDSA25519Key.make({
        privateKey: undefined,
        publicKey,
      })

      expect(edKey.isForSigning()).toBe(false)
      expect(edKey.isForVerifying()).toBe(true)
      expect(edKey.privateKey).toBeUndefined()
      expect(edKey.publicKey).toBeDefined()
    })
  })

  describe("COSESign1Builder primitives", () => {
    it("should build COSESign1 structures with exact payload preservation", () => {
      const protectedMap = SignData.headerMapNew()
      const unprotectedMap = SignData.headerMapNew()
      const headers = SignData.headersNew(protectedMap, unprotectedMap)
      const payload = SignData.fromText("test message")
      
      const builder = SignData.coseSign1BuilderNew(headers, payload, false)
      expect(builder).toBeDefined()
      expect(Buffer.from(builder.payload).equals(Buffer.from(payload))).toBe(true)
      expect(builder.payload.length).toBe(payload.length)
      for (let i = 0; i < payload.length; i++) {
        expect(builder.payload[i]).toBe(payload[i])
      }
    })

    it("should create data to sign matching CSL Sig_structure", () => {
      const protectedMap = SignData.headerMapNew()
      const protectedWithAlg = protectedMap.setAlgorithmId(SignData.AlgorithmId.EdDSA)
      const unprotectedMap = SignData.headerMapNew()
      const headers = SignData.headersNew(protectedWithAlg, unprotectedMap)
      const payload = SignData.fromText("test")
      
      const builder = SignData.coseSign1BuilderNew(headers, payload, false)
      const dataToSign = builder.makeDataToSign()
      
      const cslProtected = CSL.HeaderMap.new()
      cslProtected.set_algorithm_id(CSL.Label.from_algorithm_id(CSL.AlgorithmId.EdDSA))
      const cslProtectedSerialized = CSL.ProtectedHeaderMap.new(cslProtected)
      const cslUnprotected = CSL.HeaderMap.new()
      const cslHeaders = CSL.Headers.new(cslProtectedSerialized, cslUnprotected)
      const cslBuilder = CSL.COSESign1Builder.new(cslHeaders, payload, false)
      const cslDataToSign = cslBuilder.make_data_to_sign().to_bytes()
      
      expect(dataToSign.length).toBe(cslDataToSign.length)
      expect(Buffer.from(dataToSign).equals(Buffer.from(cslDataToSign))).toBe(true)
    })

    it("should produce COSESign1.signedData() matching CSL signed_data()", () => {
      FastCheck.assert(
        FastCheck.property(
          FastCheck.uint8Array({ minLength: 10, maxLength: 100 }),
          (payload) => {
            const protectedMap = SignData.headerMapNew()
            const protectedWithAlg = protectedMap.setAlgorithmId(SignData.AlgorithmId.EdDSA)
            const unprotectedMap = SignData.headerMapNew()
            const headers = SignData.headersNew(protectedWithAlg, unprotectedMap)
            
            const signature = Ed25519Signature.Ed25519Signature.make({ bytes: new Uint8Array(64).fill(0xab) })
            const coseSign1 = SignData.COSESign1.make({
              headers,
              payload,
              signature,
            })
            const ourSignedData = coseSign1.signedData()

            const cslProtected = CSL.HeaderMap.new()
            cslProtected.set_algorithm_id(CSL.Label.from_algorithm_id(CSL.AlgorithmId.EdDSA))
            const cslProtectedSerialized = CSL.ProtectedHeaderMap.new(cslProtected)
            const cslUnprotected = CSL.HeaderMap.new()
            const cslHeaders = CSL.Headers.new(cslProtectedSerialized, cslUnprotected)
            const cslCoseSign1 = CSL.COSESign1.new(cslHeaders, payload, new Uint8Array(64).fill(0xab))
            const cslSignedData = cslCoseSign1.signed_data(undefined, undefined).to_bytes()

            expect(ourSignedData.length).toBe(cslSignedData.length)
            expect(Buffer.from(ourSignedData).equals(Buffer.from(cslSignedData))).toBe(true)
          },
        ),
        { numRuns: 50 },
      )
    })
  })

  describe("Utility functions", () => {
    it("fromText/toText roundtrip", () => {
      const text = "Hello, Cardano!"
      const bytes = SignData.fromText(text)
      const decoded = SignData.toText(bytes)
      expect(decoded).toBe(text)
    })

    it("fromHex/toHex roundtrip", () => {
      const hex = "deadbeef"
      const bytes = SignData.fromHex(hex)
      const encoded = SignData.toHex(bytes)
      expect(encoded).toBe(hex)
    })

    it("handles empty text strings", () => {
      expect(SignData.fromText("")).toEqual(new Uint8Array(0))
      expect(SignData.toText(new Uint8Array(0))).toBe("")
    })

    it("handles empty byte arrays", () => {
      expect(SignData.toHex(new Uint8Array(0))).toBe("")
    })

    it("headerMap CBOR roundtrip with helper functions", () => {
      const headerMap = SignData.headerMapNew()
        .setAlgorithmId(SignData.AlgorithmId.EdDSA)
        .setKeyId(new Uint8Array([1, 2, 3, 4]))
      
      const bytes = SignData.headerMapToCBORBytes(headerMap)
      const decoded = SignData.headerMapFromCBORBytes(bytes)
      expect(decoded.algorithmId()).toBe(SignData.AlgorithmId.EdDSA)
      expect(Buffer.from(decoded.keyId()!).equals(Buffer.from([1, 2, 3, 4]))).toBe(true)
      
      const hex = SignData.headerMapToCBORHex(headerMap)
      const decodedFromHex = SignData.headerMapFromCBORHex(hex)
      expect(decodedFromHex.algorithmId()).toBe(SignData.AlgorithmId.EdDSA)
    })

    it("COSESign1 CBOR roundtrip with helper functions", () => {
      const protectedMap = SignData.headerMapNew()
        .setAlgorithmId(SignData.AlgorithmId.EdDSA)
      const headers = SignData.headersNew(protectedMap, SignData.headerMapNew())
      const payload = SignData.fromText("test payload")
      const signature = Ed25519Signature.Ed25519Signature.make({ 
        bytes: new Uint8Array(64).fill(0xab) 
      })
      
      const coseSign1 = SignData.COSESign1.make({
        headers,
        payload,
        signature,
      })
      
      const bytes = SignData.coseSign1ToCBORBytes(coseSign1)
      const decoded = SignData.coseSign1FromCBORBytes(bytes)
      expect(decoded.payload).toBeDefined()
      expect(Buffer.from(decoded.payload!).equals(Buffer.from(payload))).toBe(true)
      
      const hex = SignData.coseSign1ToCBORHex(coseSign1)
      const decodedFromHex = SignData.coseSign1FromCBORHex(hex)
      expect(decodedFromHex.payload).toBeDefined()
      expect(Buffer.from(decodedFromHex.payload!).equals(Buffer.from(payload))).toBe(true)
    })
  })
})
