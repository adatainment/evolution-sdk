---
"@evolution-sdk/devnet": minor
---

**Restructured module exports** for better modularity and clarity:
- Replaced monolithic `Devnet` and `DevnetDefault` exports with granular named exports: `Cluster`, `Config`, `Container`, `Genesis`, and `Images`
- Renamed types: `DevNetCluster` → `Cluster.Cluster`, `DevNetContainer` → `Container.Container`
- Moved `DEFAULT_SHELLEY_GENESIS` from `DevnetDefault` to `Config` module

**New Features:**

- **Genesis module** - Calculate and query genesis UTxOs with Cardano's `initialFundsPseudoTxIn` algorithm:
  - `calculateUtxosFromConfig()` - Deterministically compute genesis UTxOs from Shelley genesis configuration using blake2b-256 hashing
  - `queryUtxos()` - Query actual genesis UTxOs from running node via cardano-cli
  - Provides predictable UTxO structure for testing without node interaction
  
- **Images module** - Docker image management utilities:
  - `isAvailable()` - Check if Docker image exists locally
  - `pull()` - Pull Docker images with progress logging
  - `ensureAvailable()` - Conditionally pull images only when needed

**Improvements:**

- Enhanced error handling with specific error reasons (`address_conversion_failed`, `utxo_query_failed`, `utxo_parse_failed`, `image_inspection_failed`, `image_pull_failed`)
- All operations provide both Effect-based and Promise-based APIs for flexibility
- Improved test coverage with descriptive cluster names for easier debugging
- Full Effect error channel integration throughout the package

**Breaking Changes:**

Migration required for existing devnet users:

```typescript
// Before
import { Devnet, DevnetDefault } from "@evolution-sdk/devnet"

const cluster = await Devnet.Cluster.make()
const config = DevnetDefault.DEFAULT_SHELLEY_GENESIS

// After
import { Cluster, Config } from "@evolution-sdk/devnet"

const cluster = await Cluster.make()
const config = Config.DEFAULT_SHELLEY_GENESIS
```

All module functionality remains the same, only import syntax has changed to use destructured named exports from the main package.
