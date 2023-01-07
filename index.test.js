const {ServiceBroker} = require("moleculer");
const server = require("./index");
const {createConnection} = require("net");

const serverIndex = 1;
const testServiceIndex = 2;

describe("moleculer-tcp", () => {
    test("default settings are set correctly", async () => {
        await withBroker(async (broker) => {
            expect(broker.services[1].settings).toEqual({
                host: "127.0.0.1",
                port: 8181,
                emitData: true,
            })

        })
    })

    test("that it emits a listening event", async () => {
        await withBroker(async (broker) => {
            expect(getTestService(broker).listening).toBe(true);
        })
    })

    test("that it emits a close event", async () => {
        await withBroker(async (broker) => {
            await new Promise(async (resolve) => {
                getServer(broker).on("close", () => {
                    resolve()
                });

                getServer(broker).close();
            })

            expect(getTestService(broker).close).toBe(true);
        })
    })

    test("that it emits a drop event", async () => {
        await withBroker(async (broker) => {
            await withConnection(async (client) => {
                const drop = new Promise((resolve) => {
                    getServer(broker).on("drop", () => {
                        resolve()
                    })
                })

                const client2 = await connect();
                await drop;

                client2.end();

                expect(getTestService(broker).drop).toEqual(expect.objectContaining({
                    localAddress: "::ffff:127.0.0.1",
                    localPort: 8181,
                    remoteAddress: "::ffff:127.0.0.1",
                }))
            })
        }, {maxConnections: 1})
    })

    test("that it emits a connection event", async () => {
        await withBroker(async (broker) => {
            const connect = new Promise((resolve) => {
                getServer(broker).on("connection", () => {
                    resolve();
                })
            })

            await withConnection(async (client) => {
                await connect;

                expect(getTestService(broker).connection).toEqual(expect.objectContaining({
                    id: expect.any(String),
                    remoteAddress: "::ffff:127.0.0.1",
                }))
            })
        })
    })

    test("that it emits a data event when settings.emitData is set to true", async () => {
        await withBroker(async (broker) => {
            const connect = new Promise((resolve) => {
                getServer(broker).on("connection", () => {
                    resolve();
                })
            })

            await withConnection(async (client) => {
                await connect;

                const data = new Promise((resolve) => {
                    getConnection(broker).socket.on("data", (data) => {
                        resolve(data);
                    })
                })

                client.write("test");
                await data
                expect(getTestService(broker).data).toEqual(expect.objectContaining({
                    id: expect.any(String),
                    data: "test",
                }))
            })
        })

    })

})

async function createBroker(settings) {
    const service = {
        name: "test",
        events: {
            "tcp.socket.data"(ctx) {
                this.data = ctx.params;
            },
            "tcp.connection"(ctx) {
                this.connection = ctx.params;
            },
            "tcp.close"(ctx) {
                this.close = true;
            },
            "tcp.listening"(ctx) {
                this.listening = true;
            },
            "tcp.drop"(ctx) {
                this.drop = ctx.params;
            }
        }
    }

    const testServer = {
        name: "testServer",
        mixins: [server],
        dependencies: ["test"],
        settings: {
            emitData: true,
            ...settings,
        }
    }

    const broker = new ServiceBroker({logger: false});
    broker.createService(testServer);
    broker.createService(service);

    await broker.start();

    return broker;
}

async function withBroker(fn, settings = {}) {
    const broker = await createBroker(settings);
    await fn(broker);
    await broker.stop();
}

function getServer(broker) {
    return getServerService(broker).server
}

function getServerService(broker) {
    return broker.services[serverIndex]
}

function getTestService(broker) {
    return broker.services[testServiceIndex]
}

async function connect() {
    const client = createConnection({port: 8181});

    await new Promise((resolve, reject) => {
        client.on("connect", resolve);
        client.on("error", reject);
    })

    return client
}

async function withConnection(fn) {
    const client = await connect();
    await fn(client);
    client.end();
}

function getConnection(broker, index = 0) {
    return Object.values(getServerService(broker).connections)[index]
}