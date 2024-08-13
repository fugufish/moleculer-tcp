import {Context, Service, ServiceBroker, ServiceSchema, ServiceSettingSchema} from "moleculer"
import {ServerConnectionEvent, TcpServiceMixin} from "./index";
import * as net from "node:net";

interface TestService extends Service {
  eventCalled: boolean | string
}

const TestService: ServiceSchema<ServiceSettingSchema, TestService> = {
  name: "test",
  created() {
    this.listeningCalled = false
  },

}

describe("moleculer-tcp service", () => {
  it("should emit 'tcp.listening' event when server is listening", async () => {
    const broker = new ServiceBroker({ transporter: "Fake", logLevel: "debug", logger: false })
    const promise = new Promise((resolve) => {
      const testServiceSchema: ServiceSchema<ServiceSettingSchema, TestService> = {
        ...TestService,
        ...{
          events: {
            "tcp.listening": {
              handler() {
                this.eventCalled = true
                resolve(this)
              }
            }
          }
        }
      }

      broker.createService<ServiceSettingSchema, TestService>(testServiceSchema)
    })

    broker.createService({
      name: "tcp",
      mixins: [TcpServiceMixin]
    })

    await broker.start()


    await broker.waitForServices(["tcp", "test"])
    const testService = broker.getLocalService<TestService>("test")
    //
    await promise
    //
    expect(testService.eventCalled).toBe(true)

    await broker.stop()
  })

  it("should emit 'tcp.close' event when server is closed", async () => {
    const broker = new ServiceBroker({ transporter: "Fake", logLevel: "debug", logger: false })
    const promise = new Promise((resolve) => {
      const testServiceSchema: ServiceSchema<ServiceSettingSchema, TestService> = {
        ...TestService,
        ...{
          events: {
            "tcp.close": {
              handler() {
                this.eventCalled = true
                resolve(this)
              }
            }
          }
        }
      }

      broker.createService<ServiceSettingSchema, TestService>(testServiceSchema)
    })

    broker.createService({
      name: "tcp",
      mixins: [TcpServiceMixin]
    })

    await broker.start()

    await broker.waitForServices(["tcp", "test"])
    const testService = broker.getLocalService<TestService>("test")

    await broker.stop()

    await promise

    expect(testService.eventCalled).toBe(true)
  })

  it("should emit 'tcp.error' event when server has an error", async () => {
    // TODO: Implement test when we figure out how to test this scenario
  })

  it("should emit the 'tcp.connection' event when a connection is made", async () => {
    const broker = new ServiceBroker({ transporter: "Fake", logLevel: "debug" })
    const connection = new net.Socket()

    const connectionPromise = new Promise((resolve) => {
      connection.on("connect", resolve)
    })

    try {

      const promise = new Promise((resolve) => {
        const testServiceSchema: ServiceSchema<ServiceSettingSchema, TestService> = {
          ...TestService,
          ...{
            events: {
              "tcp.connection": {
                handler(ctx: Context<ServerConnectionEvent>) {
                  this.eventCalled = ctx.params.id
                  resolve(this)
                }
              }
            }
          }
        }

        broker.createService<ServiceSettingSchema, TestService>(testServiceSchema)
      })

      broker.createService({
        name: "tcp",
        mixins: [TcpServiceMixin]
      })

      await broker.start()
      await broker.waitForServices(["tcp", "test"])


      connection.connect(8181, "127.0.0.1")

      await connectionPromise
      await promise

      const testService = broker.getLocalService<TestService>("test")

      expect(testService.eventCalled).toEqual(expect.any(String))
    } finally {
      connection.destroy()
      await broker.stop()
    }
  })
})