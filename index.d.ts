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

  export default class MoleculerTCP<
    S extends TMoleculerTCPSettings
  > extends Service<S> {}
}
