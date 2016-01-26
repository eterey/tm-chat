'use strict';

import express from 'express';
import { Server } from 'http';
import socket from 'socket.io';
import Chat from './chat/chat';

let app = express();
let http = Server(app);
let io = socket(http);

app.use(express.static(__dirname + '/public'));
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

http.listen(4444, () => {
  console.info('Chat is available on port 4444.')
});

new Chat(io);
