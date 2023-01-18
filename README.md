[![Moleculer logo](http://moleculer.services/images/banner.png)](https://github.com/moleculerjs/moleculer)

This Moleculer Service mixin provides a tcp gateway. Incoming data from the connection is processed by the
`handleData` action. Override this action with your own implementation. Connections all have a unique id
and their own data store which can be utilized to store arbitrary data for the connection.

## Settings
| Property | Type | Default | Description |
| -------- | ---- | ------- | ----------- |
| `port` | `number` | `2323` | Port number to listen. This setting can also be set by the `MOLECULER_TELNET_HOST` environment variable |
| `host` | `string` | `127.0.0.1` | Hostname to listen. This setting can also be set by the `MOLECULER_TELNET_HOST` environment variable |
| `maxConnections` | `number` | `null` | Maximum number of connections. |
| `timeout` | `number` | `null` | Timeout in milliseconds. |

## Actions
| Name | Parameters | Visibility | Description |
| ---- | ---------- | ---------- |  ----------- |
| `deleteMetadata` | `id: string, key: string` | `public` | Delete a value from the connection's metadata store. This will emit the `tcp.socket.metadata.delete` event. |
| `getMetadata` | `id: string, key: string` | `public` | Get a value from the connection's metadata store. |
| `setMetadata` | `id: string, key: string, value: any` | `public` |  Set a value in the connection's metadata store. This will emit the `tcp.socket.metadata.set` event.|
| `socketClose` | `id: number` | public | Close a socket. |
| `socketWrite` | `id: string, data: string` | `public` | Write data to a socket. |

## Events
| Name | Parameters | Description |
| ---- | ---------- | ----------- |
| `tcp.socket.metadata.set` | `id: string, key: string` | Emitted when a value is set in the connection's metadata store. |
| `tcp.socket.metadata.delete` | `id: string, key: string` | Emitted when a value is deleted from the connection's metadata store. |
` `tcp.socket.data` | `id: string, data: any` | Emitted when data is received from a socket. |
| `tcp.socket.close` | `id: string` | Emitted when a socket is closed. |
| `tcp.socket.timeout` | `id: string` `timeout: number` | Emitted when a socket times out. |
| `tcp.socket.error`   | `id: string, error: any` | Emitted when a socket errors. |
| `tcp.connection` | `id: string` | Emitted when a new connection is established. |
| `tcp.close` | `id: string` | Emitted when a connection is closed. |
| `tcp.error` | `id: string, error: any` | Emitted when a connection errors. |
| `tcp.drop` | `id: string` | Emitted when a connection is dropped due to max connections. |