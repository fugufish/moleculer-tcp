[![Moleculer logo](http://moleculer.services/images/banner.png)](https://github.com/moleculerjs/moleculer)

This Moleculer Service mixin provides a tcp gateway. Incoming data from the connection is processed by the
`handleData` action. Override this action with your own implementation. Connections all have a unique id
and their own data store which can be utilized to store arbitrary data for the connection.

## Settings


| Property         | Type                                                                                                                | Default     | Description                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `port`           | `number`                                                                                                            | `2323`      | Port number to listen. This setting can also be set by the`MOLECULER_TELNET_HOST` environment variable |
| `host`           | `string`                                                                                                            | `127.0.0.1` | Hostname to listen. This setting can also be set by the`MOLECULER_TELNET_HOST` environment variable    |
| `tls`            | [`object` (see NodeJS TLS Options](https://nodejs.org/api/tls.html#tlscreateserveroptions-secureconnectionlistener) | `null`      | TLS options.                                                                                           |
| `maxConnections` | `number`                                                                                                            | `null`      | Maximum number of connections.                                                                         |
| `emitData`       | `boolean`                                                                                                           | `false`     | Emit`tcp.data` event when a new data received.                                                         |
| `timeout`        | `number`                                                                                                            | `null`      | Timeout in milliseconds.                                                                               |

## Actions


| Name                   | Parameters                                          | Visibility | Description                                                         |
| ---------------------- | --------------------------------------------------- | ---------- | ------------------------------------------------------------------- |
| `handleData`           | `data: string`                                      | private    | This action is called when a new data received from the connection. |
| `getConnectionData`    | `connectionId: string`, `key: string`               | public     | Gets data from the connection's data store.                         |
| `setConnectionData`    | `connectionId: string`, `key: string`, `value: any` | public     | Sets data to the connection's data store.                           |
| `deleteConnectionData` | `connectionId: string`, `key: string`               | public     | Deletes data from the connection's data store.                      |
| `send`                 | `connectionId: string`, `data: string`              | public     | Sends data to the connection.                                       |

## Events


| Name                 | Parameters                                                                                 | Description                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tcp.connection`     | `id: string`                                                                               | **emitted** when a client has connected.                                                                                                                           |
| `tcp.listening`      |                                                                                            | **emitted* when the server has been bound                                                                                                                          |
| `tcp.close`          |                                                                                            | **emitted** when the server closes. If connections exist, this event is not emitted until all connections are ended.                                               |
| `tcp.drop`           | `localAddress: string`, `localPort: number`, `remoteAddress: string`, `remotePort: number` | **emitted** when the number of connections reaches the threshold of `settings.maxConnections`, the server will drop new connections and emit `drop` event instead. |
| `tcp.socket.data`    | `id: string`, `data: string`                                                               | **emitted** when a client sends data. This is ONLY emitted if `settings.emitData` is set to true.                                                                  |
| `tcp.socket.close`   | `id: string`                                                                               | **emitted** when a client closes the connection.                                                                                                                   |
| `tcp.socket.error`   | `id: string`, `error: Error`                                                               | **emitted** when a client has an error.                                                                                                                            |
| `tcp.socket.timeout` | `id: string`                                                                               | **emitted** when a client has a timeout.                                                                                                                           |
