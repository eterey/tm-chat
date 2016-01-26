(function (angular, socket) {
  'use strict';

  angular.module('Chat', [
    'Chat.controllers',
    'Chat.services',
    'Chat.directives',
    'ngRoute',
    'ngSanitize',
    'ui.bootstrap',
    'ngClipboard'
  ])

    .config(['$routeProvider', function ($routeProvider) {
      $routeProvider

        .when('/', {
          templateUrl: '/templates/index.html',
          controller: 'IndexCtrl'
        })

        .when('/profile', {
          templateUrl: '/templates/profile.html',
          controller: 'ProfileCtrl'
        })

        .when('/channel', {
          templateUrl: '/templates/channel.html',
          controller: 'ChannelCtrl'
        })

        .when('/chat', {
          templateUrl: '/templates/chat.html',
          controller: 'ChatCtrl'
        })

        .when('/join/:channel/:pass?', {
          controller: 'ChatCtrl',
          template: " "
        })

        .otherwise({redirectTo: '/'});
    }])

    .run([
      '$location', '$rootScope', 'Storage', 'Chat', 'ChatSocket', 'Popup',
      function ($location, $rootScope, Storage, Chat, ChatSocket, Popup) {
        var user = Storage.user.get();
        var channel = Storage.channel.get();
        var disconnectedBefore = false;
        $rootScope.Storage = Storage;
        $rootScope.isConnected = false;
        socket.on('connect', function () {
          $rootScope.$apply(function () {
            $rootScope.isConnected = true;
          });

          if (disconnectedBefore) {
            disconnectedBefore = false;
            Popup.close();
            var usr = Storage.user.get();
            var chan = Storage.channel.get();
            if (chan && chan.name && usr) {
              $location.path('/chat');
              ChatSocket.user.known(usr);
              ChatSocket.channel.join(usr, chan);
            }
          } else {
            if (!user || !user.uuid) {
              Storage.user.set({});
              Storage.channel.set({});
              socket.emit('create user');
            } else {
              socket.emit('known user', user);
              if (channel && channel.name) {
                $rootScope.$apply(function () {
                  $location.path('/chat');
                });
                socket.emit('join channel', user, channel);
              }
            }
          }
          socket.on('disconnect', function () {
            $rootScope.$apply(function () {
              $rootScope.isConnected = false;
            });
            disconnectedBefore = true;
            Popup.show('Error', 'You have been disconnected! Please wait or refresh the page.');
          });

        });

        socket.on('joined channel', function (channel) {
          Storage.channel.set(channel);
          $rootScope.$apply(function () {
            $rootScope.$broadcast('joined channel', channel);
          });
        });

        socket.on('user created', function (newUser) {
          user = newUser;
          Storage.user.set(user);
          Storage.channel.set({});
          $rootScope.$apply(function () {
            $rootScope.$broadcast('user created', user);
          });
        });

        socket.on('channel users list', function (users) {
          $rootScope.$apply(function () {
            $rootScope.$broadcast('channel users list', users);
          });
        });

        socket.on('new channel message', function (message) {
          Chat.addText(message);
          $rootScope.$apply(function () {
            $rootScope.$broadcast('new channel message', message);
          });
        });

        socket.on('new message', function (message) {
          Chat.addText(message);
          $rootScope.$apply(function () {
            $rootScope.$broadcast('new message', message);
          });
        });

        socket.on('channel left', function (channel) {
          $rootScope.$apply(function () {
            $rootScope.$broadcast('channel left', channel);
          });
        });

        socket.on('user updated', function (uuid, oldUsername, newUsername) {
          $rootScope.$apply(function () {
            $rootScope.$broadcast('user updated', uuid, oldUsername, newUsername);
          });
        });

        socket.on('channel messages', function (messages) {
          $rootScope.$apply(function () {
            $rootScope.$broadcast('channel messages', messages);
          });
        });

        socket.on('chat error', function (error) {
          $rootScope.$apply(function () {
            $rootScope.$broadcast('chat error', error);
          });
          Popup.show('Error', error.text);
        });

        socket.on('error', function (err) {
          console.error(err);
        });

      }
    ])

    .value('Flags', function () {
      return {
        joinedChannel: false
      };
    });

})(angular, socket);
