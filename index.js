'use strict';

var os = require('os');
var nodeStatic = require('node-static');
var http = require('http');
var socketIO = require('socket.io');

var fileServer = new(nodeStatic.Server)();
var app = http.createServer(function(req, res) {
  fileServer.serve(req, res);
}).listen(8080);

var localRooms = {};

var io = socketIO.listen(app);
io.sockets.on('connection', function(client) {
    console.log("new client created");
    client.visitingRoomName = null;

    // convenience function to send server messages to the client
    function log() {
        var array = ['Message from server:'];
        array.push.apply(array, arguments);
        //console.log(array);
        client.emit('log', array);
    }

    client.on('message', function(message) {
        log("Client, " + client.id + " said:", message);
        // broadcast sends message to everyone besides this socket
        if(client.visitingRoomName !== null) {
            //we're visiting
            client.broadcast.to(client.visitingRoomName).emit('message', message);
        } else {
            //we're home
            client.broadcast.to(client.rooms[0]).emit('message', message);
        }
    });

    client.on('create', function(room){
        //replaces client.rooms[0] as 'home room'
        //check if room is free
        if (localRooms[room] === undefined) {
            //leave old home room
            if(client.rooms[0] !== undefined){
                client.leave(client.rooms[0]);
            }
            //create room
            localRooms[room] = [client];
            client.join(room, function(){
                console.log("CREATED-ROOM-CALLBACK: client: " + client.id + "has created room " + room);
            });
            log("Client ID " + client.id + " created room " + room);
            client.emit('created', room, client.id);
        }
    });

    client.on('join', function(room) {
        //does this room exist
        if(localRooms[room] !== undefined) {
            //are we in this room
            if (room !== client.rooms[0] && room !== client.rooms[1]) {
                //will we fit
                if (localRooms[room].length < 2) {
                    var exit = client.rooms[1];
                    if (exit !== undefined) {
                        log("Client " + client.id + " is leaving room " + exit);
                        //--Leave current room--
                        //socket impl
                        client.leave(client.rooms[1], function () {
                            console.log("LEAVE-ROOM-CALLBACK: client: " + client.id + " has now left the room " + exit);
                        });
                        //leave local room list
                        if (client.visitingRoomName !== null) {
                            for (var c = 0; c < localRooms[client.visitingRoomName].length; c++) {
                                if (localRooms[client.visitingRoomName][c].id === client.id) {
                                    localRooms[client.visitingRoomName].splice(c, 1);
                                }
                            }
                        }
                    }
                    //--Join room--
                    log("Client " + client.id + " is joining room " + room);
                    localRooms[room].push(client);
                    //  lets save a local hook to the room we'll be in
                    //  this will help us quit that room on hangup
                    //  "visitingRoomName"
                    client.visitingRoomName = room;
                    client.join(room, function () {
                        console.log("JOIN-ROOM-CALLBACK: client: " + client.id + "has joined room " + room);
                        log('Client ID ' + client.id + ' joined clientId ' + room);
                        io.sockets.in(room).emit('join', room);
                        client.emit('joined', room, client.id);
                        io.sockets.in(room).emit('ready');
                    });
                } else { // max two clients
                    client.emit('full', room);
                }
            } else {
                log("client " + client.id + " attempted to join room they're in.");
            }
        } else {
            log("client " + client.id + " tried to join room " + room + ", which does not exist.");
        }
        //Server Logging
        // console.log(">>>>>>>>>>>>>> client.id: " + client.id);
        // console.log("io.sockets.sockets.length (total number of clients): " + io.sockets.sockets.length);
        // console.log("Clientid: " + client.id + " client.visitingRoomName (custom variable to track room name): " + client.visitingRoomName);
        // console.log("localRooms[" + room + "].length (number of clients in room): " + localRooms[room].length);
        // var out = "";
        // for (var r in localRooms[room]) {
        //     out += localRooms[room][r].id + ", ";
        // }
        // console.log("room containts: " + out);
        // out = "";
        // for (var i in client.rooms) {
        //     out += client.rooms[i].toString() + ", ";
        // }
        // console.log("----actual client.localRooms id---- " + out);
        // console.log("");
        //end logging
    });

    client.on("leave", function(home){
        log("Client " + client.id + " attempting to leave");
        var exit = client.rooms[1];
        if(exit !== undefined) {
            //leave socket.io room
            client.leave(client.rooms[1], function(){
                console.log("DISCONNECT-CALLBACK: client: " + client.id + " has now disconnected from room " + exit);
            });
            //leave local room list
            if(client.visitingRoomName !== null){
                //find our id and remove us
                for(var c = 0; c < localRooms[client.visitingRoomName].length; c++){
                    if(localRooms[client.visitingRoomName][c].id === client.id){
                        localRooms[client.visitingRoomName].splice(c, 1);
                    }
                }
                client.visitingRoomName = null;
            }
        } else {
            console.log("Client " + client.id + " tried to disconnect, but was not visiting a room.");
        }
    });
    /*
    client.on('logout', function(data){

    });
     */

    client.on('ipaddr', function() {
        var ifaces = os.networkInterfaces();
        for (var dev in ifaces) {
          ifaces[dev].forEach(function(details) {
            if (details.family === 'IPv4' && details.address !== '127.0.0.1') {
              client.emit('ipaddr', details.address);
            }
          });
        }
    });
});
