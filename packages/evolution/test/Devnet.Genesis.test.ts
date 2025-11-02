import { describe, expect, it } from "@effect/vitest"
import { afterAll, beforeAll } from "vitest"

import * as Devnet from "../src/sdk/Devnet/Devnet.js"
import * as DevnetDefault from "../src/sdk/Devnet/DevnetDefault.js"

/**
 * Tests for Devnet.Genesis module
 * Verifies that calculated genesis UTxOs match actual chain UTxOs
 */
describe("Devnet.Genesis", () => {
  let devnetCluster: Devnet.DevNetCluster | undefined
  let genesisConfig: DevnetDefault.ShelleyGenesis

  beforeAll(async () => {
    const testAddressHex = "00813c32c92aad21770ff8001de0918f598df8c06775f77f8e8839d2a0074a515f7f32bf31a4f41c7417a8136e8152bfb42f06d71b389a6896"
    
    genesisConfig = {
      ...DevnetDefault.DEFAULT_SHELLEY_GENESIS,
      initialFunds: { [testAddressHex]: 900_000_000_000 }
    }

    devnetCluster = await Devnet.Cluster.make({
      clusterName: "genesis-test",
      ports: { node: 6002, submit: 9003 },
      shelleyGenesis: genesisConfig,
      kupo: { enabled: false },
      ogmios: { enabled: false }
    })

    await Devnet.Cluster.start(devnetCluster)
  }, 180_000)

  afterAll(async () => {
    if (devnetCluster) {
      try {
        await Devnet.Cluster.stop(devnetCluster)
        await Devnet.Cluster.remove(devnetCluster)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to stop devnet:", error)
      }
    }
  }, 60_000)

  it("should calculate genesis UTxOs from config", { timeout: 10_000 }, async () => {
    const utxos = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(genesisConfig)

    expect(utxos).toBeDefined()
    expect(utxos.length).toBe(1)
    
    const utxo = utxos[0]
    expect(utxo.txHash).toBeDefined()
    expect(utxo.txHash.length).toBe(64)
    expect(utxo.outputIndex).toBe(0)
    expect(utxo.address).toMatch(/^addr_test/)
    expect(utxo.assets).toBeDefined()
  })

  it("should query genesis UTxOs from node", { timeout: 30_000 }, async () => {
    if (!devnetCluster) throw new Error("Devnet not initialized")

    const utxos = await Devnet.Genesis.queryUtxosOrThrow(devnetCluster)

    expect(utxos).toBeDefined()
    expect(utxos.length).toBe(1)
    
    const utxo = utxos[0]
    expect(utxo.txHash).toBeDefined()
    expect(utxo.txHash.length).toBe(64)
    expect(utxo.outputIndex).toBe(0)
    expect(utxo.address).toMatch(/^addr_test/)
    expect(utxo.assets).toBeDefined()
  })

  it("should match: calculated === queried", { timeout: 30_000 }, async () => {
    if (!devnetCluster) throw new Error("Devnet not initialized")

    const calculated = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(genesisConfig)
    const queried = await Devnet.Genesis.queryUtxosOrThrow(devnetCluster)

    expect(calculated.length).toBe(queried.length)

    for (let i = 0; i < calculated.length; i++) {
      expect(calculated[i].txHash).toBe(queried[i].txHash)
      expect(calculated[i].outputIndex).toBe(queried[i].outputIndex)
      expect(calculated[i].address).toBe(queried[i].address)
      expect(calculated[i].assets).toEqual(queried[i].assets)
    }
  })

  it("should be deterministic", { timeout: 10_000 }, async () => {
    const result1 = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(genesisConfig)
    const result2 = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(genesisConfig)
    const result3 = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(genesisConfig)

    expect(result1).toEqual(result2)
    expect(result2).toEqual(result3)
  })

  it("should handle multiple funded addresses", { timeout: 10_000 }, async () => {
    const multiConfig: DevnetDefault.ShelleyGenesis = {
      ...DevnetDefault.DEFAULT_SHELLEY_GENESIS,
      initialFunds: {
        "00813c32c92aad21770ff8001de0918f598df8c06775f77f8e8839d2a0074a515f7f32bf31a4f41c7417a8136e8152bfb42f06d71b389a6896": 900_000_000_000,
        "0025da24fb5388c16f34c89f5bf92d35cf9d6afcd0f64bd3c9c7ec5a0b074a515f7f32bf31a4f41c7417a8136e8152bfb42f06d71b389a6896": 500_000_000_000,
        "01c8c47610a36034aac6fc58848bdae5c278d994ff502c05455e3b3ee8f8ed3a0eea0ef835ffa7bbfcde55f7fe9d2cc5d55ea62cecb42bab3c": 100_000_000_000
      }
    }

    const utxos = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(multiConfig)

    expect(utxos.length).toBe(3)
    
    // Each genesis UTxO has outputIndex 0
    expect(utxos[0].outputIndex).toBe(0)
    expect(utxos[1].outputIndex).toBe(0)
    expect(utxos[2].outputIndex).toBe(0)

    // Each address gets unique pseudo-TxId
    expect(utxos[0].txHash).not.toBe(utxos[1].txHash)
    expect(utxos[1].txHash).not.toBe(utxos[2].txHash)
    expect(utxos[0].txHash).not.toBe(utxos[2].txHash)
  })
})
