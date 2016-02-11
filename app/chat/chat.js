'use strict';

import hat from 'hat';
import Channels from './channels';
import Messages from './messages';
import Users from './users';

export default
class Chat {
  constructor(socket = null) {
    if (!socket) {
      throw new Error('Invalid Chat parameters!');
    }
    const messagesLimit = 100;
    this.io = socket;
    this.channels = new Channels();
    this.users = new Users();
    this.messages = new Messages(messagesLimit);

    this.io.on('connection', socket => {
      this.assignUserSocketEvents(socket);
    });
  }

  assignUserSocketEvents(socket) {
    socket.on('disconnect', () => {
      this.destroyUser(socket);
    });

    socket.on('create channel', channelReq => {
      this.handleChannelCreate(socket, channelReq);
    });

    socket.on('join channel', (user, channelReq) => {
      this.handleChannelJoin(socket, user, channelReq);
    });

    socket.on('leave channel', (user, channel) => {
      this.handleChannelLeave(socket, user, channel);
    });

    socket.on('new message', message => {
      this.handleNewMessage(message);
    });

    socket.on('create user', () => {
      this.handleCreateUser(socket);
    });

    socket.on('known user', user => {
      this.handleKnownUser(socket, user);
    });

    socket.on('get channel users list', channel => {
      this.handleGetChannelUsersList(socket, channel);
    });

    socket.on('update user', (uuid, newUsername) => {
      this.handleUpdateUser(socket, uuid, newUsername);
    });

    socket.on('get messages', channel => {
      this.handleGetMessages(socket, channel);
    });
  }

  addMessage(channelName, text, username) {
    return this.messages.addMessage(channelName, text, username);
  }

  getMessages(channelName) {
    return this.messages.getMessages(channelName);
  }

  addUser(user) {
    this.users.addUser(user);
  }

  removeUser(user) {
    if (!user || !user.uuid) {
      return false;
    }
    this.users.removeUser(user.uuid);
  }

  addUserToChannel(uuid, channelName) {
    this.channels.getChannel(channelName).addUser(uuid);
    this.users.getUser(uuid).addChannel(channelName);
  }

  removeUserFromChannel(socket, uuid, channelName, done) {
    socket.leave(channelName, err => {
      if (err) {
        this.socketError(socket, {
          type: 'leave channel err',
          text: `Could not leave channel ${channelName}! Error: ${err}`
        });
        return done(err);
      }
      this.channels.getChannel(channelName).removeUser(uuid);
      this.users.getUser(uuid).removeChannel(channelName);
      return done();
    });
  }

  destroyUser(socket) {
    if (!socket.id) {
      return false;
    }

    const user = this.findUserBySocketId(socket.id);
    if (!user || !user.uuid) {
      return false;
    }

    this.removeUserFromAllChannels(socket, user, err => {
      if (err) {
        return false;
      }
      this.removeUser(user);
    });
  }

  findUserBySocketId(socketId) {
    return this.users.getBySocketId(socketId);
  }

  addChannel(channelReq) {
    this.channels.addChannel(channelReq);
  }

  getUserChannels(uuid) {
    return this.users.getUser(uuid).getChannels();
  }

  sendMessageToChannel(channelName, text) {
    const message = this.messages.addMessage(channelName, text);
    this.io.to(channelName).emit(
      'new channel message',
      message.getMessage()
    );
  }

  channelExists(channelName) {
    return this.channels.getChannel(channelName);
  }

  socketError(socket, error) {
    socket.emit('chat error', error);
  }

  removeUserFromAllChannels(socket, user, done) {
    const channels = this.getUserChannels(user.uuid);
    let counter = channels.length;
    if (counter === 0) {
      return done();
    }

    channels.forEach(channel => {
      this.removeUserFromChannel(socket, user.uuid, channel, err => {
        if (err) {
          return done(err);
        }
        this.sendMessageToChannel(channel, `${user.getName()} left`);
        const users = this.getChannelUsers(channel);
        this.io.to(channel).emit('channel users list', users);
        counter--;
        if (counter === 0) {
          return done();
        }
      });
    });
  }

  getChannelUsers(channelName) {
    const users = [];
    this.channels.getChannel(channelName).getUsers().forEach(uuid => {
      users.push(this.users.getUser(uuid).getName());
    });
    return users;
  }

  handleChannelCreate(socket, channelReq) {
    if (!channelReq) {
      this.socketError(socket, {
        type: 'create channel err',
        text: 'Channel not set!'
      });
      return false;
    }
    if (this.channelExists(channelReq.name)) {
      this.socketError(socket, {
        type: 'channel exists',
        text: `Channel ${channelReq.name} already exists!`
      });
      return false;
    }
    const user = this.findUserBySocketId(socket.id);
    if (!user) {
      this.socketError(socket, {
        type: 'create channel err',
        text: 'Could not find user by this socket\'s id!'
      });
      return false;
    }
    this.removeUserFromAllChannels(socket, user, err => {
      if (err) {
        return false;
      }
      this.joinChannel(socket, user, channelReq);
    });
  }

  handleChannelJoin(socket, userReq, channelReq) {
    if (!userReq || !channelReq) {
      this.socketError(socket, {
        type: 'join channel err',
        text: 'User or channel not set!'
      });
      return false;
    }
    const user = this.users.getUser(userReq.uuid);
    const channel = this.channels.getChannel(channelReq.name);
    if (channel && !channel.validatePass(channelReq.password)) {
      this.socketError(socket, {
        type: 'join channel err',
        text: `Could not join channel ${channel.getName()}! Wrong password!`
      });
      return false;
    }
    this.removeUserFromAllChannels(socket, user, err => {
      if (err) {
        return false;
      }
      this.joinChannel(socket, user, channelReq);
    });
  }

  joinChannel(socket, user, channelReq) {
    socket.join(channelReq.name, err => {
      if (err) {
        this.socketError(socket, {
          type: 'join channel err',
          text: `Could not join channel ${channelReq.name}! Error: ${err}`
        });
        return false;
      }
      if (!this.channelExists(channelReq.name)) {
        this.addChannel(channelReq);
      }
      const channel = this.channels.getChannel(channelReq.name);
      this.addUserToChannel(user.getUuid(), channel.getName());
      this.sendMessageToChannel(channel.getName(), `${user.getName()} joined`);
      socket.emit('joined channel', {
        name: channel.getName(),
        password: channel.getPassword()
      });
      const users = this.getChannelUsers(channel.getName());
      this.io.to(channel.getName()).emit('channel users list', users);
    });
  }

  handleNewMessage(message) {
    const m = this.addMessage(message.channel, message.text, message.user);
    this.io.to(message.channel).emit(
      'new message',
      m.getMessage()
    );
  }

  handleCreateUser(socket) {
    const uuid = hat();  // makes the user unique
    const user = {
      uuid,
      username: `Anonymous ${(Math.floor(Math.random() * 9000) + 1000)}`,
      socketId: socket.id
    };
    this.addUser(user);
    socket.emit('user created', {
      uuid,
      username: this.users.getUser(uuid).getName()
    });
  }

  handleKnownUser(socket, userReq) {
    if (!userReq || !userReq.uuid) {
      this.socketError(socket, {
        type: 'known user err',
        text: 'User not set!'
      });
      return false;
    }
    userReq.socketId = socket.id;
    this.addUser(userReq);
    socket.emit('known user ready', {
      uuid: userReq.uuid,
      username: this.users.getUser(userReq.uuid).getName()
    });
  }

  handleGetChannelUsersList(socket, channelName) {
    if (!this.channelExists(channelName)) {
      this.socketError(socket, {
        type: 'get channel users list err',
        text: `Could not get users list for ${channelName}! Channel doesn't exist!`
      });
      return false;
    }
    const users = this.getChannelUsers(channelName);
    socket.emit('channel users list', users);
  }

  handleChannelLeave(socket, userReq, channelName) {
    socket.leave(channelName, err => {
      if (err) {
        this.socketError(socket, {
          type: 'leave channel err',
          text: `Could not leave channel ${channelName}! Error: ${err}`
        });
        return false;
      }

      const user = this.users.getUser(userReq.uuid);

      this.removeUserFromChannel(socket, user.getUuid(), channelName, err => {
        if (err) {
          return false;
        }
        socket.emit('channel left', channelName);
        this.sendMessageToChannel(channelName, `${user.getName()} left`);
        const users = this.getChannelUsers(channelName);
        this.io.to(channelName).emit('channel users list', users);
      });
    });
  }

  handleUpdateUser(socket, uuid, newUsername) {
    const user = this.users.getUser(uuid);
    const oldUsername = user.getName();
    user.setName(newUsername);
    socket.emit('user updated', uuid, oldUsername, newUsername);
    const channels = this.getUserChannels(uuid);
    channels.forEach(channel => {
      this.sendMessageToChannel(channel, `${oldUsername} renamed to ${newUsername}`);
    });
  }

  handleGetMessages(socket, channelName) {
    const messages = this.getMessages(channelName);
    socket.emit('channel messages', messages);
  }
}
