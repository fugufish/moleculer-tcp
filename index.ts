import { Service, ServiceSchema, ServiceSettingSchema } from "moleculer";
import { Server, Socket } from "net";
import { v4 as uuid } from "uuid"

/**
 * The Moleculer TCP service setting schema. The service defaults to listening on `127.0.0.1:8181`.
 */
export interface TcpServiceSettingSchema extends ServiceSettingSchema {

  /**
   * The port that the TCP server will listen on. Defaults to `8181`
   */
  port?: number

  /**
   * The host that the TCP server will listen on. Defaults to `127.0.0.1`
   */
  host?: string

  /**
   * The maximum number of connections that the server will accept. If this is not set, the server will accept an
   * unlimited number of connections.
   */
  maxConnections?: number
}

/**
 * The error event. This event is emitted when the server encounters an error.
 */
export interface ServerErrorEvent {

  /**
   * The error that the server encountered.
   */
  error: Error
}

/**
 * When the number of connections exceeds the maximum number of connections, this event is emitted.
 */
export interface ServerDropEvent {
  /**
   * The local address that the server is listening on.
   */
  localAddress: string
  /**
   * The local port that the server is listening on.
   */
  localPort: number
  /**
   * The local family that the server is listening on, either `IPv4` or `IPv6`.
   */
  localFamily: string
  /**
   * The remote address that the client is connecting
   * from.
   */
  remoteAddress: string
  /**
   * The remote port that the client is connecting
   */
  remotePort: number
  /**
   * The remote family that the client is connecting from, either `IPv4` or `IPv6`.
   */
  remoteFamily: string
}

/**
 * Event emitted when a connection is established.
 */
export interface ServerConnectionEvent {
  /**
   * The connection ID.
   */
  id: string
}

export interface TcpService extends Service {
  server: Server
  connections: Record<string, Socket>
}

/**
 * This Moleculer service mixin provides a tcp gateway. It is designed to be a very simple elevation of `net.Server` to
 * a Moleculer service with some basic default connection handling.
 */
export const TcpServiceMixin: Partial<ServiceSchema<TcpServiceSettingSchema, TcpService>> = {
  settings: {
    port: 8181,
    host: "127.0.0.1"
  },
  created() {
    this.connections = {}
  },
  async started() {
    this.server = new Server()

    const promise = new Promise((resolve, reject) => {
      this.server.once("error", reject)
      this.server.once("listening", resolve)
    })

    if (this.settings.maxConnections) {
      this.server.maxConnections = this.settings.maxConnections
    }

    this.setupServerEvents()

    this.server.listen(this.settings.port, this.settings.host)

    await promise
  },

  async stopped() {
    this.server.close()
  },

  methods: {
    /**
     * Sets up the server events for the connection.
     */
    setupServerEvents() {
      this.setupServerListeningEvent()
      this.setupServerConnectionEvent()
      this.setupServerCloseEvent()
      this.setupServerErrorEvent()
      this.setupServerDropEvent()
    },
    setupServerListeningEvent() {
      this.server.on("listening", async () => {
        this.logger.info(`TCP service listening on ${this.settings.host}:${this.settings.port}`)
        await this.broker.emit("tcp.listening")
      })
    },
    setupServerCloseEvent() {
      this.server.on("close", async () => {
        this.logger.info("TCP service closed")
        await this.broker.emit("tcp.close")
      })
    },
    setupServerErrorEvent() {
      this.server.on("error", async (error: Error) => {
        this.logger.error("TCP service error", error)
        await this.broker.emit<ServerErrorEvent>("tcp.error", { error })
      })
    },
    setupServerConnectionEvent() {
      this.server.on("connection",async (socket: Socket) => {
        const id = uuid()
        this.connections[id] = socket
        this.logger.info(`TCP connection established with ${socket.remoteAddress} with id ${id}`)
        await this.broker.emit<ServerConnectionEvent>("tcp.connection", { id })
      })
    },
    setupServerDropEvent() {
      this.server.on("drop", async (e) => {
        if (e === undefined) {
          this.logger.error("TCP connection dropped without event")
          return
        }

        const { localAddress, localPort, localFamily, remoteAddress, remotePort, remoteFamily } = e

        if (localAddress === undefined ||
          localPort === undefined ||
          localFamily === undefined ||
          remoteAddress === undefined ||
          remotePort === undefined ||
          remoteFamily === undefined) {
          this.logger.error("TCP connection dropped without event")
          return
        }

        this.logger.info(`TCP connection dropped from ${e.remoteAddress}`)
        await this.broker.emit<ServerDropEvent>("tcp.drop", {
          localAddress: localAddress,
          localPort: localPort,
          localFamily: localFamily,
          remoteAddress: remoteAddress,
          remotePort: remotePort,
          remoteFamily: remoteFamily
        })
      })
    }
  }

}
