const uuid = require("uuid").v4;
const { Errors } = require("moleculer");
const { Server } = require("net");

/**
 * This Moleculer Service mixin provides a tcp gateway. Incoming data from the connection is processed by the
 * `handleData` action. Override this action with your own implementation. Connections all have a unique id
 * and their own metadata store which can be utilized to store arbitrary data for the connection.
 *
 * ## Settings
 * | Property | Type | Default | Description |
 * | -------- | ---- | ------- | ----------- |
 * | `port` | `number` | `2323` | Port number to listen. This setting can also be set by the `MOLECULER_TELNET_HOST` environment variable |
 * | `host` | `string` | `127.0.0.1` | Hostname to listen. This setting can also be set by the `MOLECULER_TELNET_HOST` environment variable |
 * | `maxConnections` | `number` | `null` | Maximum number of connections. |
 * | `timeout` | `number` | `null` | Timeout in milliseconds. |
 *
 * ## Actions
 * | Name | Parameters | Visibility | Description |
 * | ---- | ---------- | ---------- |  ----------- |
 * | `deleteMetadata` | `id: string, key: string` | `public` | Delete a value from the connection's metadata store. This will emit the `tcp.socket.metadata.delete` event. |
 * | `getMetadata` | `id: string, key: string` | `public` | Get a value from the connection's metadata store. |
 * | `setMetadata` | `id: string, key: string, value: any` | `public` |  Set a value in the connection's metadata store. This will emit the `tcp.socket.metadata.set` event.|
 * | `socketClose` | `id: number` | public | Close a socket. |
 * | `socketWrite` | `id: string, data: string` | `public` | Write data to a socket. |
 *
 * ## Events
 * | Name | Parameters | Description |
 * | ---- | ---------- | ----------- |
 * | `tcp.socket.metadata.set` | `id: string, key: string` | Emitted when a value is set in the connection's metadata store. |
 * | `tcp.socket.metadata.delete` | `id: string, key: string` | Emitted when a value is deleted from the connection's metadata store. |
 * ` `tcp.socket.data` | `id: string, data: any` | Emitted when data is received from a socket. |
 * | `tcp.socket.close` | `id: string` | Emitted when a socket is closed. |
 * | `tcp.socket.timeout` | `id: string` `timeout: number` | Emitted when a socket times out. |
 * | `tcp.socket.error`   | `id: string, error: any` | Emitted when a socket errors. |
 * | `tcp.connection` | `id: string` | Emitted when a new connection is established. |
 * | `tcp.close` | `id: string` | Emitted when a connection is closed. |
 * | `tcp.error` | `id: string, error: any` | Emitted when a connection errors. |
 * | `tcp.drop` | `id: string` | Emitted when a connection is dropped due to max connections. |
 */
module.exports = {
  name: "tcp",
  settings: {
    // The port number to listen on
    get port() {
      if (process.env.MOLECULER_TCP_PORT) {
        return parseInt(process.env.MOLECULER_TCP_PORT, 10);
      } else {
        return 8181;
      }
    },

    // The host to listen on
    get host() {
      if (process.env.MOLECULER_TCP_HOST) {
        return process.env.MOLECULER_TCP_HOST;
      } else {
        return "127.0.0.1";
      }
    },
  },

  created() {
    this.connections = {};
  },

  async stopped() {
    this.logger.info("stopping tcp transport");
    this.server.close();
    await this.stopServer();
  },

  async started() {
    this.logger.info("starting tcp server");
    await this.startServer();
  },

  actions: {
    deleteMetadata: {
      params: {
        id: "string",
        key: "string",
      },
      async handler(ctx) {
        const { id, key } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("connection: " + id + " deleting data");

          delete this.connections[id].metadata[key];

          return this.broker.emit("tcp.socket.metadata.delete", {
            id,
            key,
          });
        } else {
          throw new Errors.MoleculerError(
            "connection not found",
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    getMetadata: {
      params: {
        id: "string",
        key: "string",
      },
      async handler(ctx) {
        const { id, key } = ctx.params;

        if (this.connections[id]) {
          return this.connections[id].metadata[key];
        } else {
          throw new Errors.MoleculerClientError(
            "connection not found",
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    onServerClose: {
      visibility: "private",
      async handler() {
        this.logger.info("tcp server closed");

        return this.broker.emit("tcp.close");
      },
    },

    onServerConnection: {
      params: {
        socket: "any",
      },
      visibility: "private",
      async handler(ctx) {
        const { socket } = ctx.params;

        this.logger.debug("received connection from " + socket.remoteAddress);

        // create new connection uuid
        const id = uuid();

        // add the socket to the connection list
        this.connections[id] = {
          id,
          socket,
          metadata: {
            type: "tcp",
            remoteAddress: socket.remoteAddress,
          },
        };

        socket.on("data", (data) =>
          this.actions.onSocketData({
            id,
            data,
          })
        );

        socket.on("close", () => {
          this.actions.onSocketClose({
            id,
          });
        });

        socket.on("error", (error) => {
          this.actions.onSocketError({
            id,
            error,
          });
        });

        socket.on("timeout", () => {
          this.actions.onSocketTimeout({
            id,
            timeout: socket.timeout,
          });
        });

        if (this.settings.timeout) {
          socket.setTimeout(this.settings.timeout);
        }

        ctx.params.id = id;

        await this.broker.emit("tcp.connection", {
          id,
        });
      },
    },

    onServerDrop: {
      params: {
        remoteAddress: "string",
        localAddress: "string",
        localPort: "number",
      },
      async handler(ctx) {
        const { remoteAddress, localAddress, localPort } = ctx.params;

        this.logger.warn(
          `dropping connection from ${remoteAddress} to ${localAddress}:${localPort}`
        );

        await this.broker.emit("tcp.drop", {
          remoteAddress,
          localAddress,
          localPort,
        });
      },
    },

    onServerError: {
      params: {
        error: "any",
      },
      visibility: "private",
      async handler(ctx) {
        const { error } = ctx.params;

        this.logger.error("socket error", error);

        await this.broker.emit("tcp.socket.error", {
          error,
        });
      },
    },

    onServerListening: {
      visibility: "private",
      async handler() {
        this.logger.info(
          "tcp server listening on " + this.server.address().port
        );

        return this.broker.emit("tcp.listening");
      },
    },

    onSocketClose: {
      params: {
        id: "string",
      },
      visibility: "private",
      async handler(ctx) {
        const { id } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("connection: " + id + " closing");

          this.connections[id].socket.end();
          return this.broker.emit("tcp.socket.close", { id });
        } else {
          throw new Errors.MoleculerClientError(
            "connection not found: " + id,
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    onSocketData: {
      params: {
        id: "string",
        data: "any",
      },
      visibility: "private",
      async handler(ctx) {
        const { id, data } = ctx.params;

        if (this.connections[id]) {
          const buffer = Buffer.from(data);

          this.logger.debug(
            "connection: " + id + " received " + buffer.length + " bytes"
          );

          return this.broker.emit("tcp.socket.data", {
            id,
            data,
          });
        } else {
          throw new Errors.MoleculerClientError(
            "connection not found: " + id,
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    // Socket actions
    onSocketError: {
      params: {
        id: "string",
        error: "any",
      },
      visibility: "private",
      async handler(ctx) {
        const { id, error } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("connection: " + id + " error: " + error);

          this.connections[id].socket.end();
          return this.broker.emit("tcp.socket.error", { id, error });
        } else {
          throw new Errors.MoleculerClientError(
            "connection not found: " + id,
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    onSocketTimeout: {
      params: {
        id: "string",
        timeout: "number",
      },
      visibility: "private",
      async handler(ctx) {
        const { id, timeout } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("connection: " + id + " timeout: " + timeout);

          this.connections[id].socket.end();
          return this.broker.emit("tcp.socket.timeout", { id });
        } else {
          throw new Errors.MoleculerClientError(
            "connection not found: " + id,
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    setMetadata: {
      params: {
        id: "string",
        key: "string",
        value: "any",
      },
      async handler(ctx) {
        const { id, key, value } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("connection: " + id + " setting data: " + key);

          this.connections[id].metadata[key] = value;

          return this.broker.emit("tcp.socket.metadata.set", {
            id,
            key,
          });
        }

        throw new Errors.MoleculerError(
          "connection not found",
          404,
          "CONNECTION_NOT_FOUND"
        );
      },
    },

    socketClose: {
      params: {
        id: "string",
      },
      handler(ctx) {
        const { id } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("closing socket: " + id);

          this.connections[id].socket.destroy();
        } else {
          throw new Errors.MoleculerError(
            "connection not found",
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },

    socketWrite: {
      params: {
        id: "string",
        data: "any",
      },
      handler(ctx) {
        const { id, data } = ctx.params;

        if (this.connections[id]) {
          this.logger.debug("writing to socket: " + id);

          this.connections[id].socket.write(data);
        } else {
          throw new Errors.MoleculerError(
            "connection not found",
            404,
            "CONNECTION_NOT_FOUND"
          );
        }
      },
    },
  },

  methods: {
    async startServer() {
      this.server = new Server();

      const result = new Promise((resolve, reject) => {
        this.server.once("error", reject);
        this.server.once("listening", resolve);
      });

      if (this.settings.maxConnections) {
        this.server.maxConnections = this.settings.maxConnections;
      }

      this.server.on("listening", () => {
        this.actions.onServerListening();
      });

      this.server.on("error", (error) => this.actions.onServerError({ error }));

      this.server.on("close", () => {
        this.actions.onServerClose();
      });

      this.server.on("drop", (socket) => {
        this.actions.onServerDrop({
          remoteAddress: socket.remoteAddress,
          localAddress: socket.localAddress,
          localPort: socket.localPort,
        });
      });

      this.server.on("connection", (socket) =>
        this.actions.onServerConnection({ socket })
      );

      this.server.listen(this.settings.port, this.settings.host);

      return result;
    },

    // Stops the TCP server
    async stopServer() {
      this.logger.info(`stopping ${this.connections.length} connections`);
      for (let id in this.connections) {
        this.connections[id].socket.end();
      }

      await new Promise((resolve) => {
        this.server.once("close", resolve);
        this.server.close();
      });
    },
  },
};
