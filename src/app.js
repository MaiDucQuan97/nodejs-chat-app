require('./db/mongoose')
const express = require("express");
const session = require('express-session');
const path = require('path');
const socketio = require('socket.io')
const http = require('http')
const { generateMessage, generateMessageId } = require('./utils/messages')

const app = express();
const server = http.createServer(app)
const io = socketio(server)
const routeUser = require('./routers/user')
const routePage = require('./routers/page')
const port = process.env.PORT

const messageReactions = {};
const sessionMiddleware = session({
    secret: 'app_chat_secret_key',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        maxAge: 3600000 // 1 hour
    },
})
app.use(sessionMiddleware);
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

app.use(express.json())
app.use(routeUser)
app.use(routePage)
app.use(express.static('src/public'));

io.use((socket, next) => {
    const username = socket.handshake.query.username;
    if (!username) {
        return next(new Error("invalid username"));
    }
    socket.username = username;
    next();
});

io.on('connection', function (socket) {
    const users = [];
    for (let [id, socket] of io.of("/").sockets) {
        users.push({
            userID: id,
            username: socket.username,
            online: true
        });
    }
    io.emit("users", users);

    socket.on('send message', function (data) {
        const messageId = (!data.id) ? generateMessageId() : data.id
        let message = {}

        if (!data.id) {
            message = messageReactions[messageId] = generateMessage(messageId, data);
        } else {
            messageReactions[messageId]['message'] = data.message
            message = messageReactions[messageId]
            message.isEdit = true
        }

        // io.sockets.emit('new message', message);
        io.to(data.to).emit('new message', message)
    });

    socket.on('react message', (data) => {
        const { messageId, reaction } = data;

        if (messageReactions.hasOwnProperty(messageId)) {
            const message = messageReactions[messageId];

            const existingReaction = message.reactions.find((r) => r.user === socket.id);

            if (existingReaction) {
                existingReaction.reaction = reaction;
            } else {
                message.reactions.push({ user: socket.id, reaction });
            }

            io.emit('update reactions', { messageId, reactions: message.reactions });
        }
    });

    socket.on("connect", () => {
        users.forEach((user) => {
            if (user.self) {
                user.online = true;
            }
        });
    });

    socket.on("disconnect", () => {
        users.forEach((user) => {
            if (user.self) {
                user.online = false;
            }
        });
    });
});

server.listen(port, () => {
    console.log(`Server is up on port ${port}`)
});
