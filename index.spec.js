/* eslint-disable no-undef */
const { ServiceBroker } = require('moleculer')
const server = require('./index')
const { Socket } = require('net')
const { EventEmitter } = require('events')

describe('moleculer-tcp', () => {
  let broker

  beforeEach(async () => {
    broker = new ServiceBroker({
      logger: false,
      transporter: 'fake'
    })

    await broker.start()
  })

  afterEach(async () => {
    await broker.stop()
  })

  describe('settings', () => {
    it('should have default settings', () => {
      expect(server.settings).toEqual(
        expect.objectContaining({
          port: 8181,
          host: '127.0.0.1'
        })
      )
    })

    it('should allow settings to be set by environment variables', () => {
      process.env.MOLECULER_TCP_PORT = '1234'
      process.env.MOLECULER_TCP_HOST = 'localhost'

      const svr = require('./index')

      expect(svr.settings).toEqual(
        expect.objectContaining({
          port: 1234,
          host: 'localhost'
        })
      )

      delete process.env.MOLECULER_TCP_PORT
      delete process.env.MOLECULER_TCP_HOST
    })
  })

  describe('actions', () => {
    let socket
    let socketBuffer
    let connectionId
    let serverService
    let responderService
    let connection

    const responder = {
      name: 'responder',
      events: {
        'tcp.socket.metadata.set' (ctx) {
          this.metadataSet(ctx.params)
          this.emitter.emit('metadata.set', ctx.params)
        },
        'tcp.socket.metadata.delete' (ctx) {
          this.metadataDelete(ctx.params)
          this.emitter.emit('metadata.delete', ctx.params)
        },
        'tcp.socket.data' (ctx) {
          this.data(ctx.params)
          this.emitter.emit('data', ctx.params)
        },
        'tcp.socket.close' (ctx) {
          this.close(ctx.params)
          this.emitter.emit('close', ctx.params)
        },
        'tcp.socket.error' (ctx) {
          this.error(ctx.params)
          this.emitter.emit('error', ctx.params)
        },
        'tcp.connection' (ctx) {
          this.connection(ctx.params)
          this.emitter.emit('connection', ctx.params)
        },
        'tcp.socket.timeout' (ctx) {
          this.timeout(ctx.params)
          this.emitter.emit('timeout', ctx.params)
        }
      },
      created () {
        this.metadataSet = jest.fn()
        this.metadataDelete = jest.fn()
        this.data = jest.fn()
        this.close = jest.fn()
        this.connection = jest.fn()
        this.timeout = jest.fn()
        this.error = jest.fn()
        this.emitter = new EventEmitter()
      }
    }

    beforeEach(async () => {
      socket = new Socket()
      socketBuffer = []

      serverService = broker.createService({
        name: 'tcp',
        mixins: [server],
        settings: {
          timeout: 100
        },
        created () {
          this.onServerConnectionAfterParams = jest.fn()
        },
        actions: {
          onServerConnection: {
            hooks: {
              after (ctx) {
                this.onServerConnectionAfterParams(ctx.params)
              }
            }
          }
        }
      })
      responderService = broker.createService(responder)

      await broker.waitForServices([server.name, responder.name])

      const connected = new Promise((resolve) => {
        responderService.emitter.on('connection', () => {
          connection = Object.values(serverService.connections)[0]
          connectionId = connection.id
          resolve()
        })
      })

      socket.on('data', (data) => {
        socketBuffer.push(data)
      })

      socket.connect(server.settings.port, server.settings.host)

      await connected
    })

    afterEach(() => {
      socket.destroy()
    })

    describe('closeSocket', () => {
      it('should close the socket', async () => {
        await broker.call('tcp.socketClose', {
          id: connectionId
        })

        expect(connection.socket.destroyed).toEqual(true)
      })
    })

    describe('setMetadata', () => {
      it("should set metadata and emit the 'tcp.socket.metadata.set' event", async () => {
        await broker.call('tcp.setMetadata', {
          id: connectionId,
          key: 'foo',
          value: 'bar'
        })

        expect(responderService.metadataSet).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            key: 'foo'
          })
        )

        expect(connection.metadata.foo).toEqual('bar')

        expect(responderService.metadataSet).toHaveBeenCalledWith({
          id: expect.any(String),
          key: 'foo'
        })
      })

      it("should set the type metadata to 'tcp'", async () => {
        expect(connection.metadata.type).toEqual('tcp')
      })

      it('should set the remoteAddress metadata to the socket remoteAddress', async () => {
        expect(connection.metadata.remoteAddress).toBeDefined()
      })

      it('throws an error if the connection does not exist', async () => {
        await expect(
          broker.call('tcp.setMetadata', {
            id: 'foo',
            key: 'bar',
            value: 'baz'
          })
        ).rejects.toThrow('connection not found')
      })
    })

    describe('getAllMetadata', () => {
      it('should return all metadata', async () => {
        await broker.call('tcp.setMetadata', {
          id: connectionId,
          key: 'foo',
          value: 'bar'
        })

        const metadata = await broker.call('tcp.getAllMetadata', {
          id: connectionId
        })

        expect(metadata).toEqual(
          expect.objectContaining({
            foo: 'bar'
          })
        )
      })
    })

    describe('mergeMetadata', () => {
      it("should merge metadata and emit the 'tcp.socket.metadata.set' event", async () => {
        await broker.call('tcp.mergeMetadata', {
          id: connectionId,
          data: {
            foo: 'bar'
          }
        })

        expect(responderService.metadataSet).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String),
            key: 'foo'
          })
        )

        expect(connection.metadata.foo).toEqual('bar')

        expect(responderService.metadataSet).toHaveBeenCalledWith({
          id: expect.any(String),
          key: 'foo'
        })
      })

      it('throws an error if the connection does not exist', async () => {
        await expect(
          broker.call('tcp.mergeMetadata', {
            id: 'foo',
            data: {
              foo: 'bar'
            }
          })
        ).rejects.toThrow('connection not found')
      })
    })

    describe('deleteMetadata', () => {
      it("should delete metadata and emit the 'tcp.socket.metadata.delete' event", async () => {
        await broker.call('tcp.setMetadata', {
          id: connectionId,
          key: 'foo',
          value: 'bar'
        })

        await broker.call('tcp.deleteMetadata', {
          id: connectionId,
          key: 'foo'
        })

        expect(responderService.metadataDelete).toHaveBeenCalledWith({
          id: expect.any(String),
          key: 'foo'
        })

        expect(connection.metadata.foo).toBeUndefined()
      })
    })

    describe('getMetadata', () => {
      it('should return metadata', async () => {
        await broker.call('tcp.setMetadata', {
          id: connectionId,
          key: 'foo',
          value: 'bar'
        })

        const metadata = await broker.call('tcp.getMetadata', {
          id: connectionId,
          key: 'foo'
        })

        expect(metadata).toEqual('bar')
      })

      it('should throw an error if the connection does not exist', async () => {
        await expect(
          broker.call('tcp.getMetadata', {
            id: 'foo',
            key: 'bar'
          })
        ).rejects.toThrow('connection not found')
      })
    })

    describe('onServerConnection', () => {
      it("should emit the 'tcp.connection' event", async () => {
        expect(responderService.connection).toHaveBeenCalledWith({
          id: expect.any(String)
        })
      })

      it('should set the ctx.id to the connection id', async () => {
        expect(
          serverService.onServerConnectionAfterParams
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            id: expect.any(String)
          })
        )
      })
    })

    describe('onSocketData', () => {
      it("should emit the 'tcp.socket.data' event", async () => {
        socket.write('foo')

        await new Promise((resolve) => setTimeout(resolve, 100))

        expect(responderService.data).toHaveBeenCalledWith({
          id: expect.any(String),
          data: expect.any(Buffer)
        })
      })
    })

    describe('onSocketClose', () => {
      it("should emit the 'tcp.socket.close' event", async () => {
        socket.destroy()

        await new Promise((resolve) => setTimeout(resolve, 100))

        expect(responderService.close).toHaveBeenCalledWith({
          id: expect.any(String)
        })
      })
    })

    describe('onSocketTimeout', () => {
      it("should emit the 'tcp.socket.close' event", async () => {
        await new Promise((resolve) => setTimeout(resolve, 150))

        expect(responderService.timeout).toHaveBeenCalledWith({
          id: expect.any(String)
        })
      })
    })

    describe('onSocketError', () => {
      it("should emit the 'tcp.socket.close' event", async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))

        connection.socket.emit('error', new Error('foo'))

        expect(responderService.error).toHaveBeenCalledWith({
          id: expect.any(String),
          error: expect.any(Error)
        })
      })
    })

    describe('socketWrite', () => {
      it('should write data to the socket', async () => {
        await broker.call('tcp.socketWrite', {
          id: connectionId,
          data: 'foo'
        })

        await new Promise((resolve) => setTimeout(resolve, 100))

        expect(socketBuffer[0].toString()).toEqual('foo')
      })

      it('should throw an error if the connection does not exist', async () => {
        await expect(
          broker.call('tcp.socketWrite', {
            id: 'foo',
            data: 'bar'
          })
        ).rejects.toThrow('connection not found')
      })
    })
  })
})
