'use strict';

class EventEmitter {

	on(e, d) {
		window.addEventListener(e, eOn);
		function eOn(e) { // this function is optional, but you will need to use d.details in your event listener
			d.apply(this, e.detail)
		}
	}
	
	emit(e) { // thanks izy
		window.dispatchEvent( new CustomEvent(e, {'detail': Array.prototype.slice.call(arguments, 1) }) );
	}
}

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
class Discord {
	
	constructor(options) {
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
	log(t) {
		if (this.debug) {
			console.log(t);
			client.e.emit('DEBUG', t);
		}
	}
	
	/**
	 * sends heartbeat
	 * @private
	 */
	heartbeat() {
		this.log('♥️ SENDING HEARTBEAT');
		this.socket.send(JSON.stringify({"op": 1,"d": this.lastS}));
	}
	
	/**
	 * Calls the discord api with the token provided to the client
	 * @param {Object} options
	 * @param {String} options.method The HTTP method to use
	 * @param {String} options.uri The uri to call
	 * @param {Object} options.body Optional body for the request
	 */
	callAPI(options, callback) {
		var base = 'https://discordapp.com/api';
		var headers = new Headers({'Authorization': this.options.token, 'Content-Type': 'application/json'});
		var temp = {method: options.method, headers: headers};
		if (options.body)
			temp.body = JSON.stringify(options.body);
		fetch(base+options.uri, temp).then(function(response) {
		  return response.json();
		}).then(function(data) {
		  callback(data);
		});
	}
	
	/**
	 * logs in
	 */
	login() {
		var self = this;
		this.callAPI({method: 'GET', uri: '/gateway'}, function(res) {
			self.socket = new WebSocket(res.url+"/?v=6&encoding=json");
			self.socket.addEventListener('message', self.onMessage.bind(self));
			self.socket.addEventListener('disconnect', self.onDisconnect.bind(self));
			self.socket.onopen = function(event) {
			    self.log('SOCKET OPEN');
			};
		})
	}
	
	/**
	 * logs out
	 */
	logout() {
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
				this.socket.send(JSON.stringify({"op": 2,"d": {"token": this.options.token,"properties": {"$browser": "funcord"},"large_threshold": 50}}));
		        this.beatInterval = setInterval(function() {
		    		self.heartbeat();
		    	}, e.d.heartbeat_interval);
		    	break;
		    case 11:
		    	this.log("♥️ GOT HEARTBEAT");
		    	break;
		    case 0:
		    	switch(e.t) {
		    		case 'READY':
		    			this.user = e.d.user;
		    			if (e.d.guilds) {
		    				e.d.guilds.forEach(function (guild) {
		    					self.guilds.set(guild.id, guild);
		    				})
		    			}
		    			this.e.emit('READY', e);
		    			break;
		    		case 'GUILD_CREATE':
		    			this.log("GUILD_CREATE", e.d.id);
						e.d.members.forEach(function(member) {
							self.users.set(member.user.id, member.user);
						});
						e.d.channels.forEach(function(channel) {
							channel.guild_id = e.d.id;
							self.channels.set(channel.id, channel);
						});
						this.guilds.set(e.d.id, e.d);
						break;
					case 'PRESENCE_UPDATE':
						self.users[e.d.user.id] = e.d;
						self.guilds.forEach(function(guild) {
							if (guild.members[e.d.user.id]) {
								guild.members[e.d.user.id].game == e.d.game;
							}
						})
						break;
					default:
						this.e.emit(e.t, e);
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
	sendMessage(id, content, callback) {
		this.callAPI({method: 'POST', uri: '/channels/'+id+'/messages', body: {content: content}}, function(res) {
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
	editMessage(channel, id, content, callback) {
		this.callAPI({method: 'PATCH', uri: '/channels/'+channel+'/messages/'+id, body: {content: content}}, function(res) {
			if (callback) callback(res);
		})
	}
	
	/**
	 * delete a message
	 * @param {String} channel the id of the channel
	 * @param {String} id the id of the message
	 * @param {Function} callback a callback with the response
	 */
	deleteMessage(channel, id, callback) {
		this.callAPI({method: 'DELETE', uri: '/channels/'+channel+'/messages/'+id}, function (res){
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
	setStatus(idle, game) {
		this.socket.send(JSON.stringify({op: 3,d: {"idle_since": idle,"game": game}}));
	}
	
	/**
	 * send typing to a channel
	 * @param {String} channel the id of the channel
	 */
	startTyping(channel) {
		this.callAPI({method: 'POST', uri: '/channels/'+channel+'/typing'}, function(res) {
			if (callback) callback(res);
		})
	}
	
	voiceState(guild, channel) {
		let payload = {
			op: 4,
			d: {
			    "guild_id": guild,
			    "channel_id": channel,
			    "self_mute": false,
			    "self_deaf": false
			}
		}
		this.socket.send(JSON.stringify(payload))
	}
}
