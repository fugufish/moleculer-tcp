const { ServiceBroker } = require("moleculer");
const server = require("./index");
const { Socket } = require("net");
const { EventEmitter } = require("events");

const serverIndex = 1;
const testServiceIndex = 2;

describe("moleculer-tcp", () => {
  let broker;

  beforeEach(async () => {
    broker = new ServiceBroker({
      logger: false,
      transporter: "fake",
    });

    await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
  });

  describe("settings", () => {
    it("should have default settings", () => {
      expect(server.settings).toEqual(
        expect.objectContaining({
          port: 8181,
          host: "127.0.0.1",
        })
      );
    });

    it("should allow settings to be set by environment variables", () => {
      process.env.MOLECULER_TCP_PORT = "1234";
      process.env.MOLECULER_TCP_HOST = "localhost";

      const svr = require("./index");

      expect(svr.settings).toEqual(
        expect.objectContaining({
          port: 1234,
          host: "localhost",
        })
      );

      delete process.env.MOLECULER_TCP_PORT;
      delete process.env.MOLECULER_TCP_HOST;
    });
  });

  describe("actions", () => {
    let socket;
    let socketBuffer;
    let connectionId;
    let serverService;
    let responderService;
    let watcherService;
    let connection;

    const responder = {
      name: "responder",
      events: {
        "tcp.socket.metadata.set"(ctx) {
          this.metadataSet(ctx.params);
        },
        "tcp.socket.metadata.delete"(ctx) {
          this.metadataDelete(ctx.params);
        },
        "tcp.socket.data"(ctx) {
          this.data(ctx.params);
        },
        "tcp.socket.close"(ctx) {
          this.close(ctx.params);
        },
        "tcp.socket.error"(ctx) {
          this.error(ctx.params);
        },
        "tcp.connection"(ctx) {
          this.connection(ctx.params);
        },
        "tcp.socket.timeout"(ctx) {
          this.timeout(ctx.params);
        },
      },
      created() {
        this.metadataSet = jest.fn();
        this.metadataDelete = jest.fn();
        this.data = jest.fn();
        this.close = jest.fn();
        this.connection = jest.fn();
        this.timeout = jest.fn();
        this.error = jest.fn();
      },
    };

    const watcher = {
      name: "watcher",
      created() {
        this.emitter = new EventEmitter();
      },
      events: {
        "tcp.connection"(ctx) {
          this.emitter.emit("connection", ctx.params);
        },
      },
    };

    beforeEach(async () => {
      socket = new Socket();
      socketBuffer = [];

      serverService = broker.createService({
        name: "tcp",
        mixins: [server],
        settings: {
          timeout: 100,
        },
      });
      responderService = broker.createService(responder);
      watcherService = broker.createService(watcher);

      await broker.waitForServices([server.name, responder.name, watcher.name]);

      const connected = new Promise((resolve) => {
        watcherService.emitter.on("connection", () => {
          connection = Object.values(serverService.connections)[0];
          connectionId = connection.id;
          resolve();
        });
      });

      socket.on("data", (data) => {
        socketBuffer.push(data);
      });

      socket.connect(server.settings.port, server.settings.host);

      await connected;
    });

    afterEach(() => {
      socket.destroy();
    });

    describe("closeSocket", () => {
      it("should close the socket", async () => {
        await broker.call("tcp.socketClose", {
          id: connectionId,
        });

        expect(connection.socket.destroyed).toEqual(true);
      });
    });

    describe("setMetadata", () => {
      it("should set metadata and emit the 'tcp.socket.metadata.set' event", async () => {
        await broker.call("tcp.setMetadata", {
          id: connectionId,
          key: "foo",
          value: "bar",
        });

        expect(responderService.metadataSet).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            key: "foo",
          })
        );

        expect(connection.metadata["foo"]).toEqual("bar");

        expect(responderService.metadataSet).toHaveBeenCalledWith({
          id: expect.any(String),
          key: "foo",
        });
      });

      it("should set the type metadata to 'tcp'", async () => {
        expect(connection.metadata.type).toEqual("tcp");
      });

      it("should set the remoteAddress metadata to the socket remoteAddress", async () => {
        expect(connection.metadata.remoteAddress).toEqual(socket.remoteAddress);
      });

      it("throws an error if the connection does not exist", async () => {
        await expect(
          broker.call("tcp.setMetadata", {
            id: "foo",
            key: "bar",
            value: "baz",
          })
        ).rejects.toThrow("connection not found");
      });
    });

    describe("deleteMetadata", () => {
      it("should delete metadata and emit the 'tcp.socket.metadata.delete' event", async () => {
        await broker.call("tcp.setMetadata", {
          id: connectionId,
          key: "foo",
          value: "bar",
        });

        await broker.call("tcp.deleteMetadata", {
          id: connectionId,
          key: "foo",
        });

        expect(responderService.metadataDelete).toHaveBeenCalledWith({
          id: expect.any(String),
          key: "foo",
        });

        expect(connection.metadata["foo"]).toBeUndefined();
      });
    });

    describe("getMetadata", () => {
      it("should return metadata", async () => {
        await broker.call("tcp.setMetadata", {
          id: connectionId,
          key: "foo",
          value: "bar",
        });

        const metadata = await broker.call("tcp.getMetadata", {
          id: connectionId,
          key: "foo",
        });

        expect(metadata).toEqual("bar");
      });

      it("should throw an error if the connection does not exist", async () => {
        await expect(
          broker.call("tcp.getMetadata", {
            id: "foo",
            key: "bar",
          })
        ).rejects.toThrow("connection not found");
      });
    });

    describe("onServerConnection", () => {
      it("should emit the 'tcp.connection' event", async () => {
        expect(responderService.connection).toHaveBeenCalledWith({
          id: expect.any(String),
        });
      });
    });

    describe("onSocketData", () => {
      it("should emit the 'tcp.socket.data' event", async () => {
        socket.write("foo");

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(responderService.data).toHaveBeenCalledWith({
          id: expect.any(String),
          data: expect.any(Buffer),
        });
      });
    });

    describe("onSocketClose", () => {
      it("should emit the 'tcp.socket.close' event", async () => {
        socket.destroy();

        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(responderService.close).toHaveBeenCalledWith({
          id: expect.any(String),
        });
      });
    });

    describe("onSocketTimeout", () => {
      it("should emit the 'tcp.socket.close' event", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150));

        expect(responderService.timeout).toHaveBeenCalledWith({
          id: expect.any(String),
        });
      });
    });

    describe("onSocketError", () => {
      it("should emit the 'tcp.socket.close' event", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));

        connection.socket.emit("error", new Error("foo"));

        expect(responderService.error).toHaveBeenCalledWith({
          id: expect.any(String),
          error: expect.any(Error),
        });
      });
    });
  });
});
