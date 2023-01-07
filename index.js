const cluster = require("cluster");
const uuid = require('uuid').v4;

/**
 * This Moleculer Service mixin provides a tcp gateway. Incoming data from the connection is processed by the
 * `handleData` action. Override this action with your own implementation. Connections all have a unique id
 * and their own data store which can be utilized to store arbitrary data for the connection.
 *
 * ## Settings
 *
 * | Property | Type | Default | Description |
 * | -------- | ---- | ------- | ----------- |
 * | `port` | `number` | `2323` | Port number to listen. This setting can also be set by the `MOLECULER_TELNET_HOST` environment variable |
 * | `host` | `string` | `127.0.0.1` | Hostname to listen. This setting can also be set by the `MOLECULER_TELNET_HOST` environment variable |
 * | `tls` | [`object` (see NodeJS TLS Options](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener) | `null` | TLS options. |
 * | `maxConnections` | `number` | `null` | Maximum number of connections. |
 * | `emitData` | `boolean` | `false` | Emit `tcp.data` event when a new data received. |
 * | `timeout` | `number` | `null` | Timeout in milliseconds. |
 *
 * ## Actions
 *
 * | Name | Parameters | Visibility | Description |
 * | ---- | ---------- | ---------- | ----------- |
 * | `handleData` | `data: string` | private | This action is called when a new data received from the connection. |
 * | `getConnectionData` | `connectionId: string`, `key: string` | public | Gets data from the connection's data store. |
 * | `setConnectionData` | `connectionId: string`, `key: string`, `value: any` | public | Sets data to the connection's data store. |
 *
 *
 * ## Events
 *
 * | Name | Parameters | Description |
 * | ---- | ---------- | ----------- |
 * | `tcp.connection` | `id: string` | **emitted** when a client has connected. |
 * | `tcp.listening` | | **emitted* when the server has been bound  |
 * | `tcp.close` | | **emitted** when the server closes. If connections exist, this event is not emitted until all connections are ended. |
 * | `tcp.drop` | `localAddress: string`, `localPort: number`, `remoteAddress: string`, `remotePort: number` | **emitted** when the number of connections reaches the threshold of `settings.maxConnections`, the server will drop new connections and emit `drop` event instead. |
 * | `tcp.socket.data` | `id: string`, `data: string` | **emitted** when a client sends data. This is ONLY emitted if `settings.emitData` is set to true. |
 * | `tcp.socket.close` | `id: string` | **emitted** when a client closes the connection. |
 * | `tcp.socket.error` | `id: string`, `error: Error` | **emitted** when a client has an error. |
 * | `tcp.socket.timeout` | `id: string` | **emitted** when a client has a timeout. |
 *
 */
module.exports = {
    name: "tcp",
    settings: {
        // The port number to listen on
        port: process.env.MOLECULER_TELNET_PORT || 8181,

        // The host to listen on
        host: process.env.MOLECULER_TELNET_IP || "127.0.0.1",
    },

    created() {
        this.connections = {}
        this.workers = []
    },

    stopped() {
        this.logger.info("stopping tcp transport");
        this.server.close();
        this.stopServer()
    },

    async started() {
        this.logger.info("starting tcp server");
        await this.startServer();
        return this.broker.emit("tcp.connected");
    },

    actions: {
        handleData: {
            params: {
                id: "string",
                data: "any",
            },
            visibility: "private",
            async handler(ctx) {
                const {id, data} = ctx.params;
                this.logger.error("override handleData action to handle incoming data");

                return Promise.resolve()
            }
        },
        getConnectionData: {
            params: {
                id: "string",
                key: "string",
            },
            async handler(ctx) {
                return Promise.resolve(this.getConnectionData(ctx.params.id, ctx.params.key))
            }
        },
        setConnectionData: {
            params: {
                id: "string",
                key: "string",
                value: "any",
            },
            async handler(ctx) {
                return Promise.resolve(this.setConnectionData(ctx.params.id, ctx.params.key, ctx.params.value))
            }
        }
    },

    methods: {
        // This is the handler for the TCP server
        connectionHandler(socket) {
            this.logger.debug("received connection from " + socket.remoteAddress);

            // create new connection uuid
            const id = uuid();

            // add the socket to the connection list
            this.connections[id] = {
                id,
                socket,
                data: {
                    type: "tcp",
                    remoteAddress: socket.remoteAddress,
                }
            };

            socket.on("data", (data) => {
                this.handleData(id, data)

                if (this.settings.emitData) {
                    this.broker.emit("tcp.socket.data", {id, data: data.toString()});
                }
            });

            // notify the connection event
            this.broker.emit("tcp.connection", {id, remoteAddress: socket.remoteAddress});
        },

        handleData(id, data) {
            this.actions.handleData({id, data});
        },

        // This is the handler for the cluster exit event
        clusterExitHandler(worker, code, signal) {
            this.logger.warn("worker " + worker.process.pid + " died");
        },
        async startServer() {
            // if this is a TLS server, we need to create a TLS server
            if (this.settings.tls) {
                const {createServer} = require("tls");

                this.server = createServer(this.settings.tls, this.connectionHandler);
            } else {
                this.logger.info("starting tcp server on " + this.settings.host + ":" + this.settings.port);
                const {createServer} = require("net");

                this.server = createServer();
            }

            const result = new Promise((resolve, reject) => {
                this.server.once("error", reject);
                this.server.once("listening", resolve);
            })

            if (this.settings.maxConnections) {
                this.server.maxConnections = this.settings.maxConnections;
            }

            this.server.on("listening", () => {
                this.broker.emit("tcp.listening")
            })
            this.server.on("close", () => {
                this.broker.emit("tcp.close")
            })
            this.server.on("drop", (socket) => {
                this.broker.emit("tcp.drop", {
                    remoteAddress: socket.remoteAddress,
                    localAddress: socket.localAddress,
                    localPort: socket.localPort
                })
            })
            this.server.on("connection", this.connectionHandler);

            this.server.listen(this.settings.port);

            return result;
        },

        // Stops the TCP server
        stopServer() {
            for (let id in this.connections) {
                this.connections[id].end();
            }

            this.server.close();
        },

        // Sends a message to a connection
        sendToConnection(id, message) {
            const buffer = Buffer.from(message);

            this.logger.debug("connection: " + id + " sending " + buffer.length + " bytes");
            if (this.connections[id]) {
                this.connections[id].socket.write(buffer);
            }
        },

        // Sets data on the connection. Data is an arbitrary store in which the developer can store data specific to
        // the connection
        setConnectionData(id, key, data) {
            if (this.connections[id]) {
                this.logger.debug("connection: " + id + " setting data: " + key);
                this.connections[id].data[key] = data;
            }
        },

        // Gets data from the connection. Data is an arbitrary store in which the developer can store data specific to
        // the connection
        getConnectionData(id, key) {
            if (this.connections[id]) {
                return this.connections[id].data[key];
            }
        }
    }

}