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

class Client {
	
	constructor(options) {
		this.lastS = 0;
		this.guilds = new Map();
		this.users = new Map();
		this.channels = new Map();
		this.options = options;
		this.debug = options.debug || false;
		this.e = new EventEmitter();
	}
	
	log(t) {
		if (this.debug) {
			console.log(t);
			client.e.emit('DEBUG', t);
		}
	}
	
	heartbeat() {
		this.log('♥️ SENDING HEARTBEAT');
		this.socket.send(JSON.stringify({"op": 1,"d": this.lastS}));
	}
	
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
	
	login() {
		this.callAPI({method: 'GET', uri: '/gateway'}, function(res) {
			this.socket = new WebSocket(res.url+"/?v=6&encoding=json");
			this.socket.addEventListener('message', this.onMessage.bind(this));
			this.socket.addEventListener('disconnect', this.onDisconnect.bind(this));
			this.socket.onopen = function(event) {
			    this.log('SOCKET OPEN');
			}.bind(this);
		}.bind(this))
	}
	
	logout() {
		this.socket.close();
	}
	
	onMessage (event) {
		var e = JSON.parse(event.data);
		this.lastS = e.s;
		
		switch (e.op) {
			case 10:
				if (this.beatInterval) clearInterval(this.beatInterval);
				this.log(e);
				if (this.options.email) {
					this.callAPI({method: 'POST', uri: '/auth/login', body: {"email": this.options.email, "password": this.options.password}}, function(res){
				        this.socket.send(JSON.stringify({"op": 2,"d": {"token": res.token,"properties": {"$browser": "funcord"},"large_threshold": 50}}));
					});
				} else {
			        this.socket.send(JSON.stringify({"op": 2,"d": {"token": this.options.token,"properties": {"$browser": "funcord"},"large_threshold": 50}}));
				}
		        this.beatInterval = setInterval(function() {
		    		this.heartbeat();
		    	}.bind(this), e.d.heartbeat_interval);
		    	break;
		    case 11:
		    	this.log("♥️ GOT HEARTBEAT");
		    	break;
		    case 0:
		    	this.log(e.t)
		    	switch(e.t) {
		    		case 'READY':
		    			this.user = e.d.user;
		    			if (e.d.guilds) {
		    				e.d.guilds.forEach(function (guild) {
		    					this.guilds.set(guild.id, guild);
		    				}.bind(this))
		    			}
		    			this.e.emit('READY', e);
		    			break;
		    		case 'GUILD_CREATE':
		    			this.log("GUILD_CREATE", e.d.id);
						e.d.members.forEach(function(member) {
							this.users.set(member.user.id, member.user);
						}.bind(this));
						e.d.channels.forEach(function(channel) {
							channel.guild_id = e.d.id;
							this.channels.set(channel.id, channel);
						}.bind(this));
						this.guilds.set(e.d.id, e.d);
						break;
					case 'PRESENCE_UPDATE':
						this.users[e.d.user.id] = e.d;
						this.guilds.forEach(function(guild) {
							if (guild.members[e.d.user.id]) {
								guild.members[e.d.user.id].game == e.d.game;
							}
						}.bind(this))
						break;
					default:
						this.e.emit(e.t, e);
						break;
		    	}
		    	break;
		}
	}
	
	onDisconnect (event) {
		this.log('DISCONNECT!');
	}
	
	sendMessage(id, content, callback) {
		this.callAPI({method: 'POST', uri: '/channels/'+id+'/messages', body: {content: content}}, function(res) {
			if (callback) callback(res);
		})
	}
	
	editMessage(channel, id, content, callback) {
		this.callAPI({method: 'PATCH', uri: '/channels/'+channel+'/messages/'+id, body: {content: content}}, function(res) {
			if (callback) callback(res);
		})
	}
	
	deleteMessage(channel, id, callback) {
		this.callAPI({method: 'DELETE', uri: '/channels/'+channel+'/messages/'+id}, function (res){
			if (callback) callback(res);
		});
	}
	
	setStatus(idle, game) {
		this.socket.send(JSON.stringify({op: 3,d: {"idle_since": idle,"game": game}}));
	}
	
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
