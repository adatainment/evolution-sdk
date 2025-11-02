/**
 * Network type for Cardano networks.
 *
 * @category model
 * @since 2.0.0
 */
export type Network = "Mainnet" | "Preview" | "Preprod" | "Custom"

/**
 * Slot configuration for a Cardano network.
 * Defines the relationship between slots and Unix time.
 *
 * @category model
 * @since 2.0.0
 */
export interface SlotConfig {
  /**
   * Unix timestamp (in milliseconds) of the network start (Shelley era).
   */
  readonly zeroTime: bigint

  /**
   * First slot number of the Shelley era.
   */
  readonly zeroSlot: bigint

  /**
   * Duration of each slot in milliseconds (typically 1000ms = 1 second).
   */
  readonly slotLength: number
}

/**
 * Network-specific slot configurations for all Cardano networks.
 *
 * - **Mainnet**: Production network starting at Shelley era
 * - **Preview**: Preview testnet for protocol updates
 * - **Preprod**: Pre-production testnet
 * - **Custom**: Customizable for emulator/devnet (initialized with zeros)
 *
 * @category constants
 * @since 2.0.0
 */
export const SLOT_CONFIG_NETWORK: Record<Network, SlotConfig> = {
  Mainnet: {
    zeroTime: 1596059091000n,
    zeroSlot: 4492800n,
    slotLength: 1000,
  },
  Preview: {
    zeroTime: 1666656000000n,
    zeroSlot: 0n,
    slotLength: 1000,
  },
  Preprod: {
    zeroTime: 1654041600000n + 1728000000n, // 1655769600000n
    zeroSlot: 86400n,
    slotLength: 1000,
  },
  Custom: {
    zeroTime: 0n,
    zeroSlot: 0n,
    slotLength: 0,
  },
}

/**
 * Convert a slot number to Unix time (in milliseconds).
 *
 * @param slot - The slot number to convert
 * @param slotConfig - The network's slot configuration
 * @returns Unix timestamp in milliseconds
 *
 * @category transformation
 * @since 2.0.0
 */
export const slotToUnixTime = (slot: bigint, slotConfig: SlotConfig): bigint => {
  const msAfterBegin = (slot - slotConfig.zeroSlot) * BigInt(slotConfig.slotLength)
  return slotConfig.zeroTime + msAfterBegin
}

/**
 * Convert a Unix time (in milliseconds) to the enclosing slot number.
 *
 * @param unixTime - Unix timestamp in milliseconds
 * @param slotConfig - The network's slot configuration
 * @returns The slot number that contains this Unix time
 *
 * @category transformation
 * @since 2.0.0
 */
export const unixTimeToSlot = (unixTime: bigint, slotConfig: SlotConfig): bigint => {
  const timePassed = unixTime - slotConfig.zeroTime
  const slotsPassed = timePassed / BigInt(slotConfig.slotLength)
  return slotsPassed + slotConfig.zeroSlot
}
