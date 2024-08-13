import { Service, ServiceBroker, ServiceSchema, ServiceSettingSchema } from "moleculer"
import { TcpServiceMixin } from "./index";

interface TestService extends Service {
  listeningCalled: boolean
}

const TestService: ServiceSchema<ServiceSettingSchema, TestService> = {
  name: "test",
  created() {
    this.listeningCalled = false
  },

}

describe("moleculer-tcp service", () => {
  it("should emit 'tcp.listening' event when server is listening", async () => {
    const broker = new ServiceBroker({transporter: "Fake", logLevel: "debug", logger: false})
    const promise = new Promise((resolve) => {
      const testServiceSchema: ServiceSchema<ServiceSettingSchema, TestService> = {
        ...TestService,
        ...{
          events: {
            "tcp.listening": {
              handler() {
                this.listeningCalled = true
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
    expect(testService.listeningCalled).toBe(true)

    await broker.stop()
  })

  it("should emit 'tcp.close' event when server is closed", async () => {
    const broker = new ServiceBroker({transporter: "Fake", logLevel: "debug", logger: false})
    const promise = new Promise((resolve) => {
      const testServiceSchema: ServiceSchema<ServiceSettingSchema, TestService> = {
        ...TestService,
        ...{
          events: {
            "tcp.close": {
              handler() {
                this.listeningCalled = true
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

    expect(testService.listeningCalled).toBe(true)
  })
})