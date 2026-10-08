const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')
require('dotenv').config()

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || 'localhost'
const port = parseInt(process.env.PORT || '3000', 10)

const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true)
      handle(req, res, parsedUrl)
    } catch (err) {
      console.error('Error handling request:', req.url, err)
      res.statusCode = 500
      res.end('Internal Server Error')
    }
  })

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    // console.log(`[Socket.IO] Client connected: ${socket.id}`)

    // 1. Join room event
    socket.on('join_room', (roomId) => {
      if (roomId) {
        socket.join(roomId)
        // console.log(`[Socket.IO] Socket ${socket.id} joined room ${roomId}`)
      }
    })

    // 2. Send message event
    socket.on('send_message', (data) => {
      const roomId = data.roomId || data.conversationId
      if (roomId) {
        // Broadcast to everyone in the room except sender (or to room)
        socket.to(roomId).emit('receive_message', data)
      } else {
        socket.broadcast.emit('receive_message', data)
      }
    })

    // 3. Typing event
    socket.on('typing', (data) => {
      const roomId = data.roomId || data.conversationId
      if (roomId) {
        socket.to(roomId).emit('typing', data)
      } else {
        socket.broadcast.emit('typing', data)
      }
    })

    // 4. Stop typing event
    socket.on('stop_typing', (data) => {
      const roomId = data.roomId || data.conversationId
      if (roomId) {
        socket.to(roomId).emit('stop_typing', data)
      } else {
        socket.broadcast.emit('stop_typing', data)
      }
    })

    socket.on('disconnect', () => {
      // console.log(`[Socket.IO] Client disconnected: ${socket.id}`)
    })
  })

  httpServer.listen(port, () => {
    console.log(`> PulseCollab server ready on http://${hostname}:${port}`)
  })
})
