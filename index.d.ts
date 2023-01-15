import { Context, Service, ServiceActions } from "moleculer";

interface IMoleculerTCPActions extends ServiceActions {
  handleData: (ctx: Context<IMoleculerTCPHandleDataParams>) => Promise<unknown>;
}

export interface IMoleculerSettingsSchema {
  /**
   * TCP server host. Default: `127.0.0.1`
   */
  host?: string;

  /**
   * TCP server port. Default: `23233`
   */
  port?: number;

  /**
   * Maximum number of connections. Unlimited if not defined. Default: `null`
   */
  maxConnections?: number;

  /**
   * Whehter or not to emit incoming data as an event. Default: `false`
   */
  emitData?: boolean;

  /**
   * The connection timeout in milliseconds. If not defined, there will be no timeout. Default: `null`
   */
  timeout: number;

  /**
   * Custom function to call when a new connection is established. Default: `null`
   * @param id the connection id
   */
  afterConnect?: (id: string) => Promise<void>;
}

/**
 * The parameters to pass to the handleData action.
 */
export interface IMoleculerTCPHandleDataParams {
  /**
   * The connection id.
   */
  id: string;

  /**
   * The data received from the connection.
   */
  data: string | Buffer;
}

export class MoleculerTCPService<
  S extends IMoleculerSettingsSchema = IMoleculerSettingsSchema
> extends Service<S> {
  actions: IMoleculerTCPActions;

  /**
   * Send data to a connection
   * @param id the connection id
   * @param data the data to send
   */
  sendToConnection(id: string, data: string): Promise<void>;
}
