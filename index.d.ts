import * as Moleculer from "moleculer";
import ServiceSchemaError = Moleculer.Errors.ServiceSchemaError;
import {TlsOptions} from "tls";
import {ServiceSchema} from "moleculer";

export type MoleculerTCPSchemaSettings = ServiceSchemaError & {
    port?: number;
    host?: string;
    tls?: TlsOptions;
}

export type MoleculerTCPSchema = ServiceSchema & {
    settings?: MoleculerTCPSchemaSettings
}