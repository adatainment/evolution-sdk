import { FastCheck } from "effect"
import { describe, expect, it } from "vitest"

import * as Bytes from "../src/core/Bytes.js"
import * as KeyHash from "../src/core/KeyHash.js"
import * as PrivateKey from "../src/core/PrivateKey.js"
import * as SignData from "../src/core/SignData.js"

describe("SignData", () => {
  describe("Payload", () => {
    it("should create a Payload from hex string", () => {
      const payload = SignData.fromHex("48656c6c6f")
      expect(payload).toBeInstanceOf(Uint8Array)
      expect(SignData.toHex(payload)).toBe("48656c6c6f")
    })

    it("should convert text to payload and back", () => {
      const originalText = "Hello, Cardano!"
      const payload = SignData.fromText(originalText)
      const decodedText = SignData.toText(payload)
      expect(decodedText).toBe(originalText)
    })
  })

  describe("signData and verifyData", () => {
    it("should sign and verify a simple message", () => {
      // Generate a private key
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)

      // Create a test address (using the public key hash)
      const addressHex = Bytes.toHex(keyHash.hash)

      // Create payload
      const payload = SignData.fromText("Hello, Cardano!")

      // Sign the data
      const signedMessage = SignData.signData(addressHex, payload, privateKey)

      // Verify it
      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, signedMessage)
      expect(isValid).toBe(true)
    })

    it("should fail verification with wrong payload", () => {
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex = KeyHash.toHex(keyHash)

      const payload1 = SignData.fromText("Hello")
      const payload2 = SignData.fromText("World")

      const signedMessage = SignData.signData(addressHex, payload1, privateKey)
      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload2, signedMessage)

      expect(isValid).toBe(false)
    })

    it("should fail verification with wrong address", () => {
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex1 = KeyHash.toHex(keyHash)
      const addressHex2 = "ff" + KeyHash.toHex(keyHash).slice(2)

      const payload = SignData.fromText("Hello")

      const signedMessage = SignData.signData(addressHex1, payload, privateKey)
      const isValid = SignData.verifyData(addressHex2, KeyHash.toHex(keyHash), payload, signedMessage)

      expect(isValid).toBe(false)
    })

    it("should fail verification with wrong key hash", () => {
      const privateKeyBytes1 = PrivateKey.generate()
      const privateKeyBytes2 = PrivateKey.generate()

      const privateKey1 = PrivateKey.fromBytes(privateKeyBytes1)
      const privateKey2 = PrivateKey.fromBytes(privateKeyBytes2)

      const keyHash1 = KeyHash.fromPrivateKey(privateKey1)
      const keyHash2 = KeyHash.fromPrivateKey(privateKey2)

      const addressHex = KeyHash.toHex(keyHash1)
      const payload = SignData.fromText("Hello")

      const signedMessage = SignData.signData(addressHex, payload, privateKey1)
      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash2), payload, signedMessage)

      expect(isValid).toBe(false)
    })

    it("should handle empty payloads", () => {
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex = KeyHash.toHex(keyHash)

      const payload = new Uint8Array(0) as SignData.Payload

      const signedMessage = SignData.signData(addressHex, payload, privateKey)
      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, signedMessage)

      expect(isValid).toBe(true)
    })

    it("should handle large payloads", () => {
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex = KeyHash.toHex(keyHash)

      // Create a large payload (1KB of data)
      const largeText = "x".repeat(1024)
      const payload = SignData.fromText(largeText)

      const signedMessage = SignData.signData(addressHex, payload, privateKey)
      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, signedMessage)

      expect(isValid).toBe(true)
    })

    it("should work with extended private keys (64 bytes)", () => {
      const extendedKey = PrivateKey.generateExtended()
      const privateKey = PrivateKey.fromBytes(extendedKey)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex = KeyHash.toHex(keyHash)

      const payload = SignData.fromText("Testing extended keys")

      const signedMessage = SignData.signData(addressHex, payload, privateKey)
      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, signedMessage)

      expect(isValid).toBe(true)
    })
  })

  describe("Property-based tests", () => {
    it("property: every signed message can be verified", () => {
      FastCheck.assert(
        FastCheck.property(
          PrivateKey.arbitrary,
          FastCheck.uint8Array({ minLength: 0, maxLength: 100 }),
          (privateKey, payloadBytes) => {
            const keyHash = KeyHash.fromPrivateKey(privateKey)
            const addressHex = KeyHash.toHex(keyHash)

            const payload = payloadBytes as SignData.Payload

            const signedMessage = SignData.signData(addressHex, payload, privateKey)
            const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, signedMessage)

            expect(isValid).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    })

    it("property: verification fails with wrong payload", () => {
      FastCheck.assert(
        FastCheck.property(
          PrivateKey.arbitrary,
          FastCheck.uint8Array({ minLength: 1, maxLength: 50 }),
          FastCheck.uint8Array({ minLength: 1, maxLength: 50 }),
          (privateKey, payloadBytes1, payloadBytes2) => {
            // Ensure payloads are different
            if (Bytes.toHex(payloadBytes1) === Bytes.toHex(payloadBytes2)) {
              return true
            }

            const keyHash = KeyHash.fromPrivateKey(privateKey)
            const addressHex = KeyHash.toHex(keyHash)

            const payload1 = payloadBytes1 as SignData.Payload
            const payload2 = payloadBytes2 as SignData.Payload

            const signedMessage = SignData.signData(addressHex, payload1, privateKey)
            const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload2, signedMessage)

            expect(isValid).toBe(false)
          }
        ),
        { numRuns: 50 }
      )
    })

    it("property: verification fails with wrong key", () => {
      FastCheck.assert(
        FastCheck.property(
          PrivateKey.arbitrary,
          PrivateKey.arbitrary,
          FastCheck.uint8Array({ minLength: 0, maxLength: 100 }),
          (privateKey1, privateKey2, payloadBytes) => {
            const keyHash1 = KeyHash.fromPrivateKey(privateKey1)
            const keyHash2 = KeyHash.fromPrivateKey(privateKey2)

            // If the keys happen to be the same, skip this test case
            if (Bytes.toHex(keyHash1.hash) === Bytes.toHex(keyHash2.hash)) {
              return true
            }

            const addressHex = KeyHash.toHex(keyHash1)
            const payload = payloadBytes as SignData.Payload

            const signedMessage = SignData.signData(addressHex, payload, privateKey1)
            const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash2), payload, signedMessage)

            expect(isValid).toBe(false)
          }
        ),
        { numRuns: 50 }
      )
    })

    it("property: text roundtrip preserves content", () => {
      FastCheck.assert(
        FastCheck.property(FastCheck.string({ minLength: 0, maxLength: 200 }), (text) => {
          const payload = SignData.fromText(text)
          const decoded = SignData.toText(payload)
          expect(decoded).toBe(text)
        }),
        { numRuns: 100 }
      )
    })
  })

  describe("Edge cases", () => {
    it("should return false for malformed COSE_Sign1", () => {
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex = "0" + Bytes.toHex(keyHash.hash) + "0".repeat(56)
      const payload = SignData.fromText("test")

      // Create a malformed signed message
      const badSignedMessage: SignData.SignedMessage = {
        signature: new Uint8Array([0x01, 0x02, 0x03]),
        key: new Uint8Array([0x04, 0x05, 0x06])
      }

      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, badSignedMessage)
      expect(isValid).toBe(false)
    })

    it("should return false for truncated signature", () => {
      const privateKeyBytes = PrivateKey.generate()
      const privateKey = PrivateKey.fromBytes(privateKeyBytes)
      const keyHash = KeyHash.fromPrivateKey(privateKey)
      const addressHex = KeyHash.toHex(keyHash)
      const payload = SignData.fromText("test")

      const signedMessage = SignData.signData(addressHex, payload, privateKey)

      // Truncate the signature
      const badSignedMessage: SignData.SignedMessage = {
        signature: signedMessage.signature.slice(0, 20),
        key: signedMessage.key
      }

      const isValid = SignData.verifyData(addressHex, KeyHash.toHex(keyHash), payload, badSignedMessage)
      expect(isValid).toBe(false)
    })
  })
})
