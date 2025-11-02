import { NodeStream } from "@effect/platform-node"
import { blake2b } from "@noble/hashes/blake2"
import Docker from "dockerode"
import { Data, Effect, Stream } from "effect"
import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import { PassThrough } from "stream"

import * as Address from "../../core/AddressEras.js"
import * as TransactionHash from "../../core/TransactionHash.js"
import * as Assets from "../Assets.js"
import type * as UTxO from "../UTxO.js"
import * as DevnetDefault from "./DevnetDefault.js"

export class CardanoDevNetError extends Data.TaggedError("CardanoDevNetError")<{
  reason: string
  message: string
  cause?: unknown
}> {}

export interface DevNetContainer {
  readonly id: string
  readonly name: string
}

export interface DevNetCluster {
  readonly cardanoNode: DevNetContainer
  readonly kupo?: DevNetContainer | undefined
  readonly ogmios?: DevNetContainer | undefined
  readonly networkName: string
}

/**
 * Image management utilities for pulling Docker images.
 *
 * @since 2.0.0
 * @category utilities
 */
const ImageUtils = {
  /**
   * Check if a Docker image exists locally.
   */
  isImageAvailable: (imageName: string) =>
    Effect.tryPromise({
      try: () => {
        const docker = new Docker()
        return docker.listImages({ filters: { reference: [imageName] } }).then((images) => images.length > 0)
      },
      catch: (cause) =>
        new CardanoDevNetError({
          reason: "container_inspection_failed",
          message: `Failed to check if image '${imageName}' is available.`,
          cause
        })
    }),

  /**
   * Pull a Docker image with progress logging.
   */
  pullImage: (imageName: string) =>
    Effect.gen(function* () {
      const docker = new Docker()

      // eslint-disable-next-line no-console
      console.log(`[Devnet] Pulling Docker image: ${imageName}`)
      // eslint-disable-next-line no-console
      console.log(`[Devnet] This may take a few minutes on first run...`)

      const stream = yield* Effect.tryPromise({
        try: () => docker.pull(imageName),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "container_creation_failed",
            message: `Failed to pull image '${imageName}'. Check internet connection and image name.`,
            cause
          })
      })

      // Wait for pull to complete
      yield* Effect.tryPromise({
        try: () =>
          new Promise<void>((resolve, reject) => {
            docker.modem.followProgress(
              stream,
              (err: Error | null) => {
                if (err) reject(err)
                else resolve()
              },
              (event: { status?: string; progress?: string; id?: string }) => {
                // Optional: Log progress
                if (event.status === "Downloading" || event.status === "Extracting") {
                  // Silent progress - only show completion
                } else if (event.status) {
                  // eslint-disable-next-line no-console
                  console.log(`[Devnet] ${event.status}${event.id ? ` ${event.id}` : ""}`)
                }
              }
            )
          }),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "container_creation_failed",
            message: `Failed to complete image pull for '${imageName}'.`,
            cause
          })
      })

      // eslint-disable-next-line no-console
      console.log(`[Devnet] ✓ Image ready: ${imageName}`)
    }),

  /**
   * Ensure image is available, pull if necessary.
   */
  ensureImageAvailable: (imageName: string) =>
    Effect.gen(function* () {
      const isAvailable = yield* ImageUtils.isImageAvailable(imageName)

      if (!isAvailable) {
        yield* ImageUtils.pullImage(imageName)
      }
    })
} as const

/**
 * Internal utilities for DevNet operations.
 *
 * @since 2.0.0
 * @category utilities
 */
const Utils = {
  findContainer: (containerName: string) =>
    Effect.tryPromise({
      try: () => {
        const docker = new Docker()
        return docker.listContainers({ all: true }).then((containers) => {
          const found = containers.find((c) => c.Names.includes(`/${containerName}`))
          return found ? docker.getContainer(found.Id) : undefined
        })
      },
      catch: (cause) =>
        new CardanoDevNetError({
          reason: "container_not_found",
          message: "Ensure Docker is running and accessible.",
          cause
        })
    }),

  writeConfigFiles: (config: Required<DevnetDefault.DevNetConfig>) =>
    Effect.gen(function* () {
      const tempDir = yield* Effect.tryPromise({
        try: () => fs.promises.mkdtemp(path.join(os.tmpdir(), "cardano-devnet-")),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "temp_directory_creation_failed",
            message: "Check if the system temp directory is writable.",
            cause
          })
      })

      const writeFile = (filename: string, content: unknown) =>
        Effect.tryPromise({
          try: () => fs.promises.writeFile(path.join(tempDir, filename), JSON.stringify(content, null, 2)),
          catch: (cause) =>
            new CardanoDevNetError({
              reason: "config_file_write_failed",
              message: `Ensure sufficient disk space and write permissions for ${filename}.`,
              cause
            })
        })

      const setFilePermissions = (filename: string, mode: number) =>
        Effect.tryPromise({
          try: () => fs.promises.chmod(path.join(tempDir, filename), mode),
          catch: (cause) =>
            new CardanoDevNetError({
              reason: "file_permissions_failed",
              message: `Check if the filesystem supports permission changes for ${filename}.`,
              cause
            })
        })

      const topology = {
        Producers: []
      } as const

      yield* Effect.all([
        writeFile("config.json", config.nodeConfig),
        writeFile("topology.json", topology),
        writeFile("genesis-byron.json", config.byronGenesis),
        writeFile("genesis-shelley.json", config.shelleyGenesis),
        writeFile("genesis-alonzo.json", config.alonzoGenesis),
        writeFile("genesis-conway.json", config.conwayGenesis),
        writeFile("kes.skey", config.kesKey),
        setFilePermissions("kes.skey", 0o600), // Owner read/write only
        writeFile("pool.cert", config.opCert),
        setFilePermissions("pool.cert", 0o600), // Owner read/write only
        writeFile("vrf.skey", config.vrfSkey),
        setFilePermissions("vrf.skey", 0o600) // Owner read/write only
      ])

      return tempDir
    }),

  createCardanoContainer: (config: Required<DevnetDefault.DevNetConfig>, networkName: string, tempDir: string) =>
    Effect.tryPromise({
      try: () => {
        const docker = new Docker()
        const volumeName = `${config.clusterName}-ipc`
        return docker.createContainer({
          Image: config.image,
          name: `${config.clusterName}-cardano-node`,
          ExposedPorts: {
            [`${config.ports.node}/tcp`]: {},
            [`${config.ports.submit}/tcp`]: {}
          },
          HostConfig: {
            PortBindings: {
              [`${config.ports.node}/tcp`]: [{ HostPort: String(config.ports.node) }],
              [`${config.ports.submit}/tcp`]: [{ HostPort: String(config.ports.submit) }]
            },
            Binds: [
              `${tempDir}:/opt/cardano/config:ro`,
              `${tempDir}:/opt/cardano/keys:ro`,
              `${volumeName}:/opt/cardano/ipc`
            ]
            // NetworkMode: networkName,
          },
          Env: [
            `CARDANO_NODE_SOCKET_PATH=/opt/cardano/ipc/node.socket`,
            `CARDANO_BLOCK_PRODUCER=true`,
            `CARDANO_NETWORK_MAGIC=${config.networkMagic}`
          ],
          Cmd: [
            "run",
            "--topology",
            "/opt/cardano/config/topology.json",
            "--database-path",
            "/opt/cardano/data",
            "--socket-path",
            "/opt/cardano/ipc/node.socket",
            "--host-addr",
            "0.0.0.0",
            "--port",
            String(config.ports.node),
            "--config",
            "/opt/cardano/config/config.json",
            "--shelley-kes-key",
            "/opt/cardano/config/kes.skey",
            "--shelley-vrf-key",
            "/opt/cardano/config/vrf.skey",
            "--shelley-operational-certificate",
            "/opt/cardano/config/pool.cert"
          ]
        })
      },
      catch: (cause) =>
        new CardanoDevNetError({
          reason: "container_creation_failed",
          message: "Verify Docker daemon is running and the image is accessible.",
          cause
        })
    }),

  createKupoContainer: (config: Required<DevnetDefault.DevNetConfig>, networkName: string, tempDir: string) =>
    Effect.gen(function* () {
      if (!config.kupo.enabled) return undefined

      const docker = new Docker()
      const kupoName = `${config.clusterName}-kupo`
      const volumeName = `${config.clusterName}-ipc`

      // Build command arguments with proper type checking
      const cmdArgs = [
        "--node-socket",
        "/ipc/node.socket",
        "--host",
        "0.0.0.0",
        "--port",
        String(config.kupo.port),
        "--log-level",
        config.kupo.logLevel || "Info",
        "--node-config",
        "/config/config.json",
        "--match",
        config.kupo.match || "*",
        "--since",
        config.kupo.since || "origin",
        "--workdir",
        "/db"
      ]

      // Add optional defer-db-indexes flag
      if (config.kupo.deferDbIndexes) {
        cmdArgs.push("--defer-db-indexes")
      }

      return yield* Effect.tryPromise({
        try: () =>
          docker.createContainer({
            Image: config.kupo.image || DevnetDefault.DEFAULT_KUPO_CONFIG.image,
            name: kupoName,
            ExposedPorts: {
              [`${config.kupo.port || DevnetDefault.DEFAULT_KUPO_CONFIG.port}/tcp`]: {}
            },
            HostConfig: {
              PortBindings: {
                [`${config.kupo.port || DevnetDefault.DEFAULT_KUPO_CONFIG.port}/tcp`]: [
                  {
                    HostPort: String(config.kupo.port || DevnetDefault.DEFAULT_KUPO_CONFIG.port)
                  }
                ]
              },
              // NetworkMode: networkName,
              Binds: [`${tempDir}:/config:ro`, `${volumeName}:/ipc`]
            },
            Env: [`CARDANO_NETWORK=custom`, `CARDANO_NODE_SOCKET_PATH=/ipc/node.socket`],
            Cmd: cmdArgs
          }),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "kupo_container_creation_failed",
            message: "Failed to create Kupo container. Check Docker permissions and image availability.",
            cause
          })
      })
    }),

  createOgmiosContainer: (config: Required<DevnetDefault.DevNetConfig>, networkName: string, tempDir: string) =>
    Effect.gen(function* () {
      if (!config.ogmios.enabled) return undefined

      const docker = new Docker()
      const ogmiosName = `${config.clusterName}-ogmios`
      const volumeName = `${config.clusterName}-ipc`

      return yield* Effect.tryPromise({
        try: () =>
          docker.createContainer({
            Image: config.ogmios.image || DevnetDefault.DEFAULT_OGMIOS_CONFIG.image,
            name: ogmiosName,
            ExposedPorts: {
              [`${config.ogmios.port || DevnetDefault.DEFAULT_OGMIOS_CONFIG.port}/tcp`]: {}
            },
            HostConfig: {
              PortBindings: {
                [`${config.ogmios.port || DevnetDefault.DEFAULT_OGMIOS_CONFIG.port}/tcp`]: [
                  {
                    HostPort: String(config.ogmios.port || DevnetDefault.DEFAULT_OGMIOS_CONFIG.port)
                  }
                ]
              },
              // NetworkMode: networkName,
              Binds: [`${tempDir}:/config:ro`, `${volumeName}:/ipc`]
            },
            Env: [`NETWORK=custom`, `CARDANO_NODE_SOCKET_PATH=/ipc/node.socket`],
            Cmd: [
              "--log-level",
              config.ogmios.logLevel || DevnetDefault.DEFAULT_OGMIOS_CONFIG.logLevel,
              "--host",
              "0.0.0.0",
              "--port",
              String(config.ogmios.port || DevnetDefault.DEFAULT_OGMIOS_CONFIG.port),
              "--node-socket",
              "/ipc/node.socket",
              "--node-config",
              "/config/config.json"
            ]
          }),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "ogmios_container_creation_failed",
            message: "Failed to create Ogmios container. Check Docker permissions and image availability.",
            cause
          })
      })
    })
} as const

/**
 * Cluster management operations for Cardano DevNet.
 *
 * @since 2.0.0
 * @category cluster
 */
export const Cluster = {
  /**
   * Create a new cardano devnet cluster with optional Kupo and Ogmios containers.
   *
   * @since 2.0.0
   * @category constructors
   */
  makeEffect: (config: DevnetDefault.DevNetConfig = {}): Effect.Effect<DevNetCluster, CardanoDevNetError> =>
    Effect.gen(function* () {
      const fullConfig: Required<DevnetDefault.DevNetConfig> = {
        clusterName: config.clusterName ?? DevnetDefault.DEFAULT_DEVNET_CONFIG.clusterName,
        image: config.image ?? DevnetDefault.DEFAULT_DEVNET_CONFIG.image,
        ports: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.ports,
          ...config.ports
        },
        networkMagic: config.networkMagic ?? DevnetDefault.DEFAULT_DEVNET_CONFIG.networkMagic,
        nodeConfig: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.nodeConfig,
          ...config.nodeConfig
        },
        byronGenesis: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.byronGenesis,
          ...config.byronGenesis
        },
        shelleyGenesis: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.shelleyGenesis,
          ...config.shelleyGenesis
        },
        alonzoGenesis: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.alonzoGenesis,
          ...config.alonzoGenesis
        },
        conwayGenesis: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.conwayGenesis,
          ...config.conwayGenesis
        },
        kesKey: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.kesKey,
          ...config.kesKey
        },
        opCert: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.opCert,
          ...config.opCert
        },
        vrfSkey: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.vrfSkey,
          ...config.vrfSkey
        },
        kupo: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.kupo,
          ...config.kupo
        },
        ogmios: {
          ...DevnetDefault.DEFAULT_DEVNET_CONFIG.ogmios,
          ...config.ogmios
        }
      }

      const networkName = `${fullConfig.clusterName}-network`

      // Write configuration files
      const tempDir = yield* Utils.writeConfigFiles(fullConfig)

      // Remove existing containers if they exist
      const containerNames = [
        `${fullConfig.clusterName}-cardano-node`,
        `${fullConfig.clusterName}-kupo`,
        `${fullConfig.clusterName}-ogmios`
      ]

      for (const containerName of containerNames) {
        const existingContainer = yield* Utils.findContainer(containerName)
        if (existingContainer) {
          const info = yield* Effect.tryPromise({
            try: () => existingContainer.inspect(),
            catch: (cause) =>
              new CardanoDevNetError({
                reason: "container_inspection_failed",
                message: "The container may be in an invalid state.",
                cause
              })
          })

          if (info.State.Running) {
            yield* Effect.tryPromise({
              try: () => existingContainer.stop(),
              catch: (cause) =>
                new CardanoDevNetError({
                  reason: "container_stop_failed",
                  message: "Try manually stopping the container or restarting Docker.",
                  cause
                })
            })
          }

          yield* Effect.tryPromise({
            try: () => existingContainer.remove(),
            catch: (cause) =>
              new CardanoDevNetError({
                reason: "container_removal_failed",
                message: "Ensure no processes are using the container.",
                cause
              })
          })
        }
      }

      // Ensure Docker images are available (pull if necessary)
      yield* ImageUtils.ensureImageAvailable(fullConfig.image)

      if (fullConfig.kupo.enabled) {
        const kupoImage = fullConfig.kupo.image || DevnetDefault.DEFAULT_KUPO_CONFIG.image
        yield* ImageUtils.ensureImageAvailable(kupoImage)
      }

      if (fullConfig.ogmios.enabled) {
        const ogmiosImage = fullConfig.ogmios.image || DevnetDefault.DEFAULT_OGMIOS_CONFIG.image
        yield* ImageUtils.ensureImageAvailable(ogmiosImage)
      }

      // Create containers
      const cardanoContainer = yield* Utils.createCardanoContainer(fullConfig, networkName, tempDir)
      const kupoContainer = yield* Utils.createKupoContainer(fullConfig, networkName, tempDir)
      const ogmiosContainer = yield* Utils.createOgmiosContainer(fullConfig, networkName, tempDir)

      return {
        cardanoNode: {
          id: cardanoContainer.id,
          name: `${fullConfig.clusterName}-cardano-node`
        },
        kupo: kupoContainer
          ? {
              id: kupoContainer.id,
              name: `${fullConfig.clusterName}-kupo`
            }
          : undefined,
        ogmios: ogmiosContainer
          ? {
              id: ogmiosContainer.id,
              name: `${fullConfig.clusterName}-ogmios`
            }
          : undefined,
        networkName
      }
    }),

  /**
   * Create a new cardano devnet cluster, throws on error.
   *
   * @since 2.0.0
   * @category constructors
   */
  make: (config: DevnetDefault.DevNetConfig = {}) => Effect.runPromise(Cluster.makeEffect(config)),

  /**
   * Start a devnet cluster (all containers).
   *
   * @since 2.0.0
   * @category lifecycle
   */
  startEffect: (cluster: DevNetCluster): Effect.Effect<void, CardanoDevNetError> =>
    Effect.gen(function* () {
      // Start Cardano node first
      yield* Container.startEffect(cluster.cardanoNode)
      const docker = new Docker().getContainer(cluster.cardanoNode.id)
      const awaitForBlockProduction = Effect.promise(() =>
        docker.logs({
          stdout: true,
          stderr: true,
          follow: true
        })
      ).pipe(
        Stream.fromEffect,
        Stream.flatMap((stream) =>
          NodeStream.fromReadable(
            () => stream,
            (error) =>
              new CardanoDevNetError({
                reason: "container_inspection_failed",
                message: "Failed to read container logs",
                cause: error
              })
          )
        ),
        Stream.takeUntil(
          (line) =>
            line.toString().includes("Forge.Loop.AdoptedBlock") || line.toString().includes("Forge.Loop.NodeIsLeader")
        ),
        Stream.runDrain
      )
      yield* awaitForBlockProduction

      // Start child containers
      if (cluster.kupo) {
        yield* Container.startEffect(cluster.kupo)
      }
      if (cluster.ogmios) {
        yield* Container.startEffect(cluster.ogmios)
      }
    }),

  /**
   * Start a devnet cluster, throws on error.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  start: (cluster: DevNetCluster) => Effect.runPromise(Cluster.startEffect(cluster)),

  /**
   * Stop a devnet cluster (all containers).
   *
   * @since 2.0.0
   * @category lifecycle
   */
  stopEffect: (cluster: DevNetCluster): Effect.Effect<void, CardanoDevNetError> =>
    Effect.gen(function* () {
      // Stop child containers first
      if (cluster.kupo) {
        yield* Container.stopEffect(cluster.kupo)
      }
      if (cluster.ogmios) {
        yield* Container.stopEffect(cluster.ogmios)
      }

      // Stop Cardano node last
      yield* Container.stopEffect(cluster.cardanoNode)
    }),

  /**
   * Stop a devnet cluster, throws on error.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  stop: (cluster: DevNetCluster) => Effect.runPromise(Cluster.stopEffect(cluster)),

  /**
   * Remove a devnet cluster (all containers and network).
   *
   * @since 2.0.0
   * @category lifecycle
   */
  removeEffect: (cluster: DevNetCluster): Effect.Effect<void, CardanoDevNetError> =>
    Effect.gen(function* () {
      // Remove containers (removeContainer stops them first)
      yield* Container.removeEffect(cluster.cardanoNode)
      if (cluster.kupo) {
        yield* Container.removeEffect(cluster.kupo)
      }
      if (cluster.ogmios) {
        yield* Container.removeEffect(cluster.ogmios)
      }
    }),

  /**
   * Remove a devnet cluster, throws on error.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  remove: (cluster: DevNetCluster) => Effect.runPromise(Cluster.removeEffect(cluster))
} as const

/**
 * Individual container management operations.
 *
 * @since 2.0.0
 * @category container
 */
export const Container = {
  /**
   * Start a specific devnet container.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  startEffect: (container: DevNetContainer): Effect.Effect<void, CardanoDevNetError> =>
    Effect.tryPromise({
      try: () => new Docker().getContainer(container.id).start(),
      catch: (cause) =>
        new CardanoDevNetError({
          reason: "container_start_failed",
          message: "Check if ports are available and Docker has sufficient resources.",
          cause
        })
    }),

  /**
   * Start a specific devnet container, throws on error.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  start: (container: DevNetContainer) => Effect.runPromise(Container.startEffect(container)),

  /**
   * Stop a specific devnet container.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  stopEffect: (container: DevNetContainer): Effect.Effect<void, CardanoDevNetError> =>
    Effect.gen(function* () {
      const docker = new Docker()
      const dockerContainer = docker.getContainer(container.id)

      const info = yield* Effect.tryPromise({
        try: () => dockerContainer.inspect(),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "container_inspection_failed",
            message: "The container may have been removed externally.",
            cause
          })
      })

      if (info.State.Running) {
        yield* Effect.tryPromise({
          try: () => dockerContainer.stop(),
          catch: (cause) =>
            new CardanoDevNetError({
              reason: "container_stop_failed",
              message: "Try force stopping with 'docker stop --force' or restart Docker.",
              cause
            })
        })
      }
    }),

  /**
   * Stop a specific devnet container, throws on error.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  stop: (container: DevNetContainer) => Effect.runPromise(Container.stopEffect(container)),

  /**
   * Remove a specific devnet container.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  removeEffect: (container: DevNetContainer): Effect.Effect<void, CardanoDevNetError> =>
    Effect.gen(function* () {
      yield* Container.stopEffect(container)

      yield* Effect.tryPromise({
        try: () => new Docker().getContainer(container.id).remove(),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "container_removal_failed",
            message: "Ensure the container is stopped and no volumes are in use.",
            cause
          })
      })
    }),

  /**
   * Remove a specific devnet container, throws on error.
   *
   * @since 2.0.0
   * @category lifecycle
   */
  remove: (container: DevNetContainer) => Effect.runPromise(Container.removeEffect(container)),

  /**
   * Get container status information.
   *
   * @since 2.0.0
   * @category inspection
   */
  getStatusEffect: (container: DevNetContainer): Effect.Effect<Docker.ContainerInspectInfo | undefined, CardanoDevNetError> =>
    Effect.tryPromise({
      try: () => new Docker().getContainer(container.id).inspect(),
      catch: (cause) =>
        new CardanoDevNetError({
          reason: "container_inspection_failed",
          message: "The container may be corrupted or inaccessible.",
          cause
        })
    }),

  /**
   * Get container status information, throws on error.
   *
   * @since 2.0.0
   * @category inspection
   */
  getStatus: (container: DevNetContainer) => Effect.runPromise(Container.getStatusEffect(container)),

  /**
   * Check if a Docker image is available locally.
   *
   * @since 2.0.0
   * @category image-management
   */
  isImageAvailableEffect: (imageName: string) => ImageUtils.isImageAvailable(imageName),

  /**
   * Check if a Docker image is available locally, throws on error.
   *
   * @since 2.0.0
   * @category image-management
   */
  isImageAvailable: (imageName: string) => Effect.runPromise(ImageUtils.isImageAvailable(imageName)),

  /**
   * Pull a Docker image.
   *
   * @since 2.0.0
   * @category image-management
   */
  downloadImageEffect: (imageName: string) => ImageUtils.pullImage(imageName),

  /**
   * Pull a Docker image, throws on error.
   *
   * @since 2.0.0
   * @category image-management
   */
  downloadImage: (imageName: string) => Effect.runPromise(ImageUtils.pullImage(imageName)),

  /**
   * Ensure image is available, pull if necessary.
   *
   * @since 2.0.0
   * @category image-management
   */
  ensureImageAvailableEffect: (imageName: string) => ImageUtils.ensureImageAvailable(imageName),

  /**
   * Ensure image is available, pull if necessary. Throws on error.
   *
   * @since 2.0.0
   * @category image-management
   */
  ensureImageAvailable: (imageName: string) => Effect.runPromise(ImageUtils.ensureImageAvailable(imageName)),

  /**
   * Execute a command inside a container and return the stdout output.
   * Properly handles Docker's multiplexed streams.
   *
   * @example
   * ```typescript
   * import * as Devnet from "@evolve/evolution/Devnet"
   *
   * const output = await Devnet.Container.execCommand(cluster.cardanoNode, [
   *   "cardano-cli", "query", "tip",
   *   "--socket-path", "/opt/cardano/ipc/node.socket",
   *   "--testnet-magic", "42"
   * ])
   * const tipData = JSON.parse(output)
   * ```
   *
   * @since 2.0.0
   * @category execution
   */
  execCommandEffect: (container: DevNetContainer, command: Array<string>): Effect.Effect<string, CardanoDevNetError> =>
    Effect.gen(function* () {
      const docker = new Docker()
      const dockerContainer = docker.getContainer(container.id)

      const exec = yield* Effect.tryPromise({
        try: () =>
          dockerContainer.exec({
            Cmd: command,
            AttachStdout: true,
            AttachStderr: true
          }),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "container_inspection_failed",
            message: `Failed to create exec instance in container '${container.name}'.`,
            cause
          })
      })

      const stream = yield* Effect.tryPromise({
        try: () => exec.start({ Detach: false }),
        catch: (cause) =>
          new CardanoDevNetError({
            reason: "container_inspection_failed",
            message: `Failed to start exec in container '${container.name}'.`,
            cause
          })
      })

      // Demux Docker stream to separate stdout/stderr and remove control characters
      const stdout = new PassThrough()
      const stderr = new PassThrough()
      docker.modem.demuxStream(stream, stdout, stderr)

      let output = ""
      let _errorOutput = ""

      stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString()
      })

      stderr.on("data", (chunk: Buffer) => {
        _errorOutput += chunk.toString()
      })

      yield* Effect.promise(
        () =>
          new Promise<void>((resolve) => {
            stream.on("end", resolve)
          })
      )

      return output.trim()
    }),

  /**
   * Execute a command inside a container and return the stdout output. Throws on error.
   *
   * @since 2.0.0
   * @category execution
   */
  execCommand: (container: DevNetContainer, command: Array<string>) =>
    Effect.runPromise(Container.execCommandEffect(container, command))
} as const

/**
 * Genesis UTxO operations for deterministic calculation and querying.
 *
 * @since 2.0.0
 * @category genesis
 */
export const Genesis = {
  /**
   * Calculate genesis UTxOs deterministically from shelley genesis configuration.
   * No node interaction required - purely computational.
   *
   * Implementation follows Cardano's `initialFundsPseudoTxIn` algorithm:
   * Each address gets a unique pseudo-TxId by hashing the address itself (not the genesis JSON).
   * This matches the Haskell implementation in cardano-ledger.
   *
   * Algorithm:
   * 1. For each address in initialFunds:
   *    a. Serialize address to CBOR bytes
   *    b. Hash with blake2b-256 → this becomes the TxId
   *    c. Output index is always 0 (minBound)
   *
   * Reference: cardano-ledger/eras/shelley/impl/src/Cardano/Ledger/Shelley/Genesis.hs
   * `initialFundsPseudoTxIn addr = TxIn (pseudoTxId addr) minBound`
   * `pseudoTxId = TxId . unsafeMakeSafeHash . Hash.castHash . Hash.hashWith serialiseAddr`
   *
   * @example
   * ```typescript
   * import * as Devnet from "@evolution-sdk/evolution/Devnet"
   *
   * const genesisConfig = {
   *   initialFunds: {
   *     "00813c32c92aad21...": 900_000_000_000
   *   },
   *   // ... other genesis config
   * }
   *
   * const utxos = await Devnet.Genesis.calculateUtxosFromConfigOrThrow(
   *   genesisConfig
   * )
   * ```
   *
   * @since 2.0.0
   * @category genesis
   */
  calculateUtxosFromConfig: (
    genesisConfig: DevnetDefault.ShelleyGenesis
  ): Effect.Effect<ReadonlyArray<UTxO.UTxO>, CardanoDevNetError> =>
    Effect.gen(function* () {
      const utxos: Array<UTxO.UTxO> = []
      const fundEntries = Object.entries(genesisConfig.initialFunds)

      for (const [addressHex, lovelace] of fundEntries) {
        // Convert hex address to Address object and bech32
        const addressBech32 = yield* Effect.try({
          try: () => {
            const addr = Address.fromHex(addressHex)
            return Address.toBech32(addr)
          },
          catch: (e) =>
            new CardanoDevNetError({
              reason: "container_inspection_failed",
              message: `Failed to convert genesis address hex to bech32: ${addressHex}`,
              cause: e
            })
        })

        // Calculate pseudo-TxId by hashing the address bytes
        // This matches Cardano's: Hash.hashWith serialiseAddr addr
        const addr = Address.fromHex(addressHex)
        const addressBytes = Address.toBytes(addr)
        const txHashBytes = blake2b(addressBytes, { dkLen: 32 })
        const txHash = TransactionHash.toHex(new TransactionHash.TransactionHash({ hash: txHashBytes }))

        utxos.push({
          txHash,
          outputIndex: 0, // Genesis UTxOs always use index 0 (minBound in Haskell)
          address: addressBech32,
          assets: Assets.fromLovelace(BigInt(lovelace))
        })
      }

      return utxos
    }),

  /**
   * Calculate genesis UTxOs from config, throws on error.
   *
   * @since 2.0.0
   * @category genesis
   */
  calculateUtxosFromConfigOrThrow: (genesisConfig: DevnetDefault.ShelleyGenesis) =>
    Effect.runPromise(Genesis.calculateUtxosFromConfig(genesisConfig)),

  /**
   * Query genesis UTxOs from the running node using cardano-cli.
   * This is the "source of truth" method that queries actual chain state.
   *
   * @since 2.0.0
   * @category genesis
   */
  queryUtxos: (cluster: DevNetCluster): Effect.Effect<ReadonlyArray<UTxO.UTxO>, CardanoDevNetError> =>
    Effect.gen(function* () {
      const output = yield* Container.execCommandEffect(cluster.cardanoNode, [
        "cardano-cli",
        "conway",
        "query",
        "utxo",
        "--whole-utxo",
        "--socket-path",
        "/opt/cardano/ipc/node.socket",
        "--testnet-magic",
        "42",
        "--out-file",
        "/dev/stdout"
      ])

      const parsed = yield* Effect.try({
        try: () => JSON.parse(output) as Record<string, { address: string; value: { lovelace: number } }>,
        catch: (e) =>
          new CardanoDevNetError({
            reason: "container_inspection_failed",
            message: "Failed to parse UTxO query output from cardano-cli",
            cause: e
          })
      })

      return Object.entries(parsed).map(([key, data]) => {
        const [txHash, outputIndex] = key.split("#")
        return {
          txHash,
          outputIndex: parseInt(outputIndex),
          address: data.address,
          assets: Assets.fromLovelace(BigInt(data.value.lovelace))
        }
      })
    }),

  /**
   * Query genesis UTxOs from node, throws on error.
   *
   * @since 2.0.0
   * @category genesis
   */
  queryUtxosOrThrow: (cluster: DevNetCluster) => Effect.runPromise(Genesis.queryUtxos(cluster))
} as const
