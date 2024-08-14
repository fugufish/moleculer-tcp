import Moleculer, {Context, Service, ServiceBroker, ServiceSchema, ServiceSettingSchema} from "moleculer";
import {Server, Socket} from "net";
import {v4 as uuid} from "uuid"
import MoleculerError = Moleculer.Errors.MoleculerError;

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

  /**
   * The connection class to use when a new connection is established.
   */
  connectionClass?: typeof Connection
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

/**
 * Event emitted when data is received from a socket.
 */
export interface SocketDataEvent extends ServerConnectionEvent {
  data: string
}

/**
 * Socket error event.
 */
export type SocketErrorEvent = ServerErrorEvent & ServerConnectionEvent

/**
 * Parameters for the connection action
 */
export interface ConnectionActionParams {
  /**
   * The connection ID.
   */
  id: string
}

/**
 * Parameters for the write action
 */
export interface WriteActionParams extends ConnectionActionParams {
  /**
   * The data to write to the connection.
   */
  data: string
}

export interface TcpService extends Service {
  server: Server
  connections: Record<string, Connection>

  handleNewConnection(socket: Socket): Promise<void>

  setupServerEvents(): void

  setupServerListeningEvent(): void

  setupServerConnectionEvent(): void

  setupServerCloseEvent(): void

  setupServerErrorEvent(): void

  setupServerDropEvent(): void
}

const TCP_SERVER_EVENT_PREFIX = "tcp.server"
const TCP_SOCKET_EVENT_PREFIX = "tcp.socket"


/**
 * Event emitted when a new connection is established.
 */
export const TCP_SERVER_CONNECTION_EVENT = `${TCP_SERVER_EVENT_PREFIX}.connection`

/**
 * Event emitted when a connection is dropped.
 */
export const TCP_SERVER_DROP_EVENT = `${TCP_SERVER_EVENT_PREFIX}.drop`

/**
 * Event emitted when an error occurs in the server.
 */
export const TCP_SERVER_ERROR_EVENT = `${TCP_SERVER_EVENT_PREFIX}.error`

/**
 * Event emitted when the server is closed.
 */
export const TCP_SERVER_CLOSE_EVENT = `${TCP_SERVER_EVENT_PREFIX}.close`

/**
 * Event emitted when the server starts listening.
 */
export const TCP_SERVER_LISTENING_EVENT = `${TCP_SERVER_EVENT_PREFIX}.listening`

/**
 * Event emitted when data is received from a socket.
 */
export const TCP_SOCKET_DATA_EVENT = `${TCP_SOCKET_EVENT_PREFIX}.data`

/**
 * Event emitted when a socket is closed.
 */
export const TCP_SOCKET_CLOSE_EVENT = `${TCP_SOCKET_EVENT_PREFIX}.close`

/**
 * Event emitted when a socket encounters an error.
 */
export const TCP_SOCKET_ERROR_EVENT = `${TCP_SOCKET_EVENT_PREFIX}.error`

/**
 * Event emitted when a socket times out.
 */
export const TCP_SOCKET_TIMEOUT_EVENT = `${TCP_SOCKET_EVENT_PREFIX}.timeout`


/**
 * A Connection represents a connection to a client.
 */
export class Connection {
  /**
   * The connection ID.
   */
  readonly id: string

  /**
   * The socket that the connection is using.
   */
  private readonly socket: Socket

  /**
   * The broker that the connection is using.
   */
  private readonly broker: ServiceBroker

  /**
   * @param broker The broker that the connection is using.
   * @param socket The socket that the connection is using.
   */
  constructor(broker: ServiceBroker, socket: Socket) {
    this.id = uuid().toString()
    this.socket = socket
    this.broker = broker

    socket.on("data", async (buffer) => {
      await this.broker.emit<SocketDataEvent>(TCP_SOCKET_DATA_EVENT, {data: buffer.toString(), id: this.id})
    })

    socket.on("close", async () => {
      this.socket.destroy()
      await this.broker.emit(TCP_SOCKET_CLOSE_EVENT, {id: this.id})
    })

    socket.on("error", async (error: Error) => {
      await this.broker.emit<SocketErrorEvent>(TCP_SOCKET_ERROR_EVENT, {id: this.id, error})
    })

    socket.on("timeout", async () => {
      await this.broker.emit(TCP_SOCKET_TIMEOUT_EVENT, {id: this.id})
    })
  }

  /**
   * Writes data to the socket.
   */
  write(data: string) {
    this.socket.write(data)
  }

  /**
   * Destroys the connection.
   */
  destroy() {
    this.socket.destroy()
  }
}

/**
 * This Moleculer service mixin provides a tcp gateway. It is designed to be a very simple elevation of `net.Server` to
 * a Moleculer service with some basic default connection handling.
 */
export const TcpServiceMixin: Partial<ServiceSchema<TcpServiceSettingSchema, TcpService>> = {
  settings: {
    port: 8181,
    host: "127.0.0.1",
    connectionClass: Connection
  },
  created(this: TcpService) {
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

    if (this.settings.maxConnections) {
      this.server.maxConnections = this.settings.maxConnections
    }

    this.server.listen(this.settings.port, this.settings.host)

    await promise
  },

  async stopped() {
    await Promise.all(
      Object.values(this.connections).map((connection) => {
        connection.destroy()
      })
    )
    await new Promise((resolve) => {
      this.server.close(resolve)
    })
  },

  actions: {
    write: {
      params: {
        id: "string",
        data: "string"
      },
      async handler(this: TcpService, ctx: Context<WriteActionParams>) {
        const connection = this.connections[ctx.params.id]
        if (connection === undefined) {
          throw new MoleculerError("Connection not found", 404)
        }

        connection.write(ctx.params.data)
      }
    },

    close: {
      params: {
        id: "string"
      },
      async handler(this: TcpService, ctx: Context<ConnectionActionParams>) {
        const connection = this.connections[ctx.params.id]
        if (connection === undefined) {
          throw new MoleculerError("Connection not found", 404)
        }

        connection.destroy()
      }
    }
  },

  events: {
    TCP_SOCKET_CLOSE_EVENT: {
      handler(this: TcpService, ctx: Context<ServerConnectionEvent>) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.connections[ctx.params.id]
      }
    }

  },

  methods: {
    async handleNewConnection(socket: Socket) {
      const connection = new this.settings.connectionClass(socket)
      this.connections[connection.id] = connection
      await this.broker.emit<ServerConnectionEvent>(TCP_SERVER_CONNECTION_EVENT, {id: this.id})
    },
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
        await this.broker.emit(TCP_SERVER_LISTENING_EVENT)
      })
    },
    setupServerCloseEvent() {
      this.server.on("close", async () => {
        this.logger.info("TCP service closed")
        await this.broker.emit(TCP_SERVER_CLOSE_EVENT)
      })
    },
    setupServerErrorEvent() {
      this.server.on("error", async (error: Error) => {
        this.logger.error("TCP service error", error)
        await this.broker.emit<ServerErrorEvent>(TCP_SERVER_ERROR_EVENT, {error})
      })
    },
    setupServerConnectionEvent() {
      this.server.on("connection", async (socket: Socket) => {
        await this.handleNewConnection(socket)
      })
    },
    setupServerDropEvent() {
      this.server.on("drop", async (e) => {
        if (e === undefined) {
          this.logger.error("TCP connection dropped without event")
          return
        }

        const {
          localAddress,
          localPort,
          localFamily,
          remoteAddress,
          remotePort,
          remoteFamily
        } = e

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
        await this.broker.emit<ServerDropEvent>(TCP_SERVER_DROP_EVENT, {
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
