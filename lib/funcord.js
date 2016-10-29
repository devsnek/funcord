'use strict';
class EventEmitter {
  on (e, d) {
    window.addEventListener(e, function (e) {
      d.apply(this, e.detail);
    });
  }
  emit (e) { // thanks izy
    window.dispatchEvent(new CustomEvent(e, { // eslint-disable-line
      'detail': Array.prototype.slice.call(arguments, 1)
    }));
  }
}

((scope) => {
  /**
   * The main Discord client
   * @class Discord
   * @param {Object} options Options to pass to the client
   * @param {String} options.token Token to log in with
   * @param {Boolean} options.debug Enables lots of debugging console stuff
   * @prop {Map} guilds Map of guilds
   * @prop {Map} channels Map of channels
   * @prop {Map} users Map of users
   * @prop {EventEmitter} e The main EventEmitter
   */
  class Client {
    constructor (options) {
      this.lastS = 0;
      this.guilds = new Map();
      this.users = new Map();
      this.channels = new Map();
      this.options = options;
      this.debug = options.debug || false;
      this.e = new EventEmitter();
    }
    /**
     * debug logs
     * @param t anything that needs to be logged/debugged
     * @private
     */
    log (t) {
      if (this.debug) {
        console.log(t);
        this.e.emit('DEBUG', t);
      }
    }
    /**
     * sends heartbeat
     * @private
     */
    heartbeat () {
      this.log('♥️ SENDING HEARTBEAT');
      this.socket.send(JSON.stringify({
        'op': 1,
        'd': this.lastS
      }));
    }
    /**
     * Calls the discord api with the token provided to the client
     * @param {Object} options
     * @param {String} options.method The HTTP method to use
     * @param {String} options.uri The uri to call
     * @param {Object} options.body Optional body for the request
     */
    callAPI (options, callback) {
      var base = 'https://discordapp.com/api';
      var headers = new Headers({ // eslint-disable-line
        'Authorization': this.options.token,
        'Content-Type': 'application/json'
      });
      var temp = {
        method: options.method,
        headers: headers
      };
      if (options.body) temp.body = JSON.stringify(options.body);
      fetch(base + options.uri, temp).then(function (response) { // eslint-disable-line
        return response.json();
      }).then(function (data) {
        callback(data);
      }).catch(function (err) {
        callback(err);
      });
    }
    /**
     * logs in
     */
    login () {
      var self = this;
      this.callAPI({
        method: 'GET',
        uri: '/gateway'
      }, function (res) {
        self.socket = new WebSocket(res.url + "/?v=6&encoding=json"); // eslint-disable-line
        self.socket.addEventListener('message', self.onMessage.bind(self));
        self.socket.addEventListener('disconnect', self.onDisconnect.bind(self));
        self.socket.onopen = function (event) {
          self.log('SOCKET OPEN');
        };
      })
    }
    /**
     * logs out
     */
    logout () {
      this.socket.close();
    }
    /**
     * handles all messages from the gateway
     * @param {Object} event
     * @private
     */
    onMessage (event) {
      var self = this;
      var e = JSON.parse(event.data);
      this.lastS = e.s;
      switch (e.op) {
        case 10:
          if (this.beatInterval) clearInterval(this.beatInterval);
          this.socket.send(JSON.stringify({
            'op': 2,
            'd': {
              'token': this.options.token,
              'properties': {
                '$browser': 'funcord'
              },
              'large_threshold': 50
            }
          }));
          this.beatInterval = setInterval(function () {
            self.heartbeat();
          }, e.d.heartbeat_interval);
          break;
        case 11:
          this.log('♥️ GOT HEARTBEAT');
          break;
        case 0:
          switch (e.t) {
            case 'READY':
              this.user = e.d.user;
              if (e.d.guilds) {
                e.d.guilds.forEach(function (guild) {
                  self.guilds.set(guild.id, guild);
                })
              }
              this.e.emit('READY', e.d);
              break;
            case 'GUILD_CREATE':
              this.log('GUILD_CREATE', e.d.id);
              e.d.members = new Map();
              for (const member of e.d.members) {
              	e.d.members.set(member.user.id, member.user);
              }
              for (const channel of e.d.channels) {
              	channel.guild_id = e.d.id;
              	self.channels.set(channel.id, channel);
              }
              this.guilds.set(e.d.id, e.d);
              break;
            case 'PRESENCE_UPDATE':
              self.users.set(e.d.user.id, e.d);
              for (const guild of self.guilds.values()) {
              	if (guild.members.has(e.d.user.id)) {
              	  guild.members.get(e.d.user.id).game = e.d.game;
              	}
              }
              break;
            default:
              this.e.emit(e.t, e.d);
              break;
          }
          break;
      }
    }
    /**
     * handles gateway diconnect
     * @param {Object} event
     * @private
     */
    onDisconnect (event) {
      this.log('DISCONNECT!');
    }
    /**
     * send a message to a channel
     * @param {String} id the id of the channel
     * @param {String} content the content of the messages
     * @param {Function} callback a callback with the response
     */
    sendMessage (id, content, callback) {
      this.callAPI({
        method: 'POST',
        uri: '/channels/' + id + '/messages',
        body: {
          content: content
        }
      }, function (res) {
        if (callback) callback(res);
      })
    }
    /**
     * update a message content
     * @param {String} channel the id of the channel
     * @param {String} id the id of the emssage
     * @param {String} content the content of the messages
     * @param {Function} callback a callback with the response
     */
    editMessage (channel, id, content, callback) {
      this.callAPI({
        method: 'PATCH',
        uri: '/channels/' + channel + '/messages/' + id,
        body: {
          content: content
        }
      }, function (res) {
        if (callback) callback(res);
      })
    }
    /**
     * delete a message
     * @param {String} channel the id of the channel
     * @param {String} id the id of the message
     * @param {Function} callback a callback with the response
     */
    deleteMessage (channel, id, callback) {
      this.callAPI({
        method: 'DELETE',
        uri: '/channels/' + channel + '/messages/' + id
      }, function (res) {
        if (callback) callback(res);
      });
    }
    /**
     * set the status of the client
     * @param {Int} idle the time since idle
     * @param {Object} game the game that the client is playing
     * @param {String} game.name the name of the game
     * @param {Int} game.type the type of game (if not streaming set this to 0)
     * @param {String} game.url if type is 1 set this to a twitch url
     */
    setStatus (idle, game) {
      this.socket.send(JSON.stringify({
        op: 3,
        d: {
          'idle_since': idle,
          'game': game
        }
      }));
    }
    /**
     * send typing to a channel
     * @param {String} channel the id of the channel
     */
    startTyping (channel, callback) {
      this.callAPI({
        method: 'POST',
        uri: '/channels/' + channel + '/typing'
      }, function (res) {
        if (callback) callback(res);
      })
    }
    /**
     * get logs for a channel
     * @param {String} channel the id of the channel
     * @param {Object} options the options to pass
     * @param {String} options.around get messages around this message ID
     * @param {String} options.before get messages before this message ID
     * @param {String} options.after get messages after this message ID
     * @param {Integer} options.limit max number of messages to return (1-100)
     */
    getChannelLogs (channel, options, callback) {
      var uri = '/channels/' + channel + '/messages?';
      if (options.around) uri += '&around=' + options.around;
      if (options.before) uri += '&around=' + options.before;
      if (options.after) uri += '&around=' + options.after
      if (options.alimit) uri += '&around=' + options.limit;
      this.callAPI({
        method: 'GET',
        uri: uri
      }, function (res) {
        if (callback) callback(res);
      })
    }
    setNickname (guild, nick, user, callback) {
      this.callAPI({
        method: 'PATCH',
        uri: '/guilds/' + guild + '/members/' + user,
        body: {
          nick: nick
        }
      }, function (res) {
        if (callback) callback(res);
      })
    }
  }
  scope.Discord = {
    Client: Client
  }
})(window);
