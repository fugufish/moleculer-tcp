declare module "moleculer-tcp" {
  import { ServiceSettingSchema, Service } from "moleculer";

  /**
   * The Moleculer TCP service settings.
   */
  export interface TMoleculerTCPSettings extends ServiceSettingSchema {
    /**
     * The port that the TCP server will listen on. Defaults to `8181`
     */

    port?: number;

    /**
     * The host that the TCP server will listen on. Defaults to `127.0.0.1`
     */
    host?: string;
  }

  /**
   * The parameters that are used for the sever connection callbacks.
   */

  export interface ISocketActionParams {
    /**
     * The connection ID. This should be a UUID.
     */
    id: string;
  }

  /**
   * The parameters for the `socketWrite` action.
   */
  export interface IWriteActionParams extends ISocketActionParams {
    /**
     * Data to write to the connection.
     */
    data: string | Buffer;
  }

  export interface IMergeMetadataActionParams extends ISocketActionParams {
    /**
     * The metadata to merge into the connection metadata.
     */
    metadata: Record<string, any>;
  }

  /**
   * The parameters for the `setMetadata` action..
   */
  export interface ISetMetadataActionParams extends ISocketActionParams {
    /**
     * The key to set in the connection metadata.
     */
    key: string;

    /**
     * The value to set in the connection metadata.
     */
    value: any;
  }

  /**
   * The `getMetadata` action parameters.
   */
  export interface IGetMetadataActionParams extends ISocketActionParams {
    /**
     * The key to get from the connection metadata.
     */
    key: string;
  }

  /**
   * The `deleteMetadata` action parameters.
   */
  export interface IDeleteMetadataActionParams extends ISocketActionParams {
    /**
     * The key to delete from the connection metadata.
     */
    key: string;
  }

  /**
   * The parameters for the `onSocketData` action.
   */
  export interface IOnSocketDataActionParams extends ISocketActionParams {
    /**
     * The data that was received from the connection.
     */
    data: string | Buffer;
  }

  export default class MoleculerTCP<
    S extends TMoleculerTCPSettings
  > extends Service<S> {}
}
