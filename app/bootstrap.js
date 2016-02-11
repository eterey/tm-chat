'use strict';

import express from 'express';
import http from 'http';
import socket from 'socket.io';
import path from 'path';
import Chat from './chat/chat';

const createServer = port => {
  const app = express();
  const server = http.createServer(app);
  const io = socket(server);

  const publicDir = path.join(__dirname, 'public');
  app.use(express.static(publicDir));
  app.get('/', (req, res) => {
    const indexPage = path.join(publicDir, 'index.html');
    res.sendFile(indexPage);
  });

  port = port || 4444;
  server.listen(port, () => {
    console.info(`Chat is available on port ${port}.`);
  });

  return new Chat(io);
};

// TODO: Make possible to configure port
createServer();
