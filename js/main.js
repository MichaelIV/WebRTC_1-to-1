'use strict';

var isChannelReady = false;
var owner = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var pcConfig = {'iceServers': [{ 'url': 'stun:stun.l.google.com:19302'}]};
// Set up audio and video regardless
var sdpConstraints = {
    'mandatory': { 'OfferToReceiveAudio': true, 'OfferToReceiveVideo': true}
};

//socket
//server
var clientId = prompt("User ID", "");
console.log("USER ID: " + clientId);
var socket = io.connect();
if(document.querySelector("#callbuttonId") !== null){
    document.querySelector("#callbuttonId").addEventListener("click", function() {
        if(document.querySelector("#callfieldId") !== null){
            var tocall = document.querySelector("#callfieldId").value;
            if(tocall !== null && tocall !== "") {
                console.log("client attempting to join room: " + tocall);
                socket.emit('join', tocall);
                isChannelReady = true;
                isStarted = false;
                console.log('>>>>>>> maybeStart() ', "false: " + isStarted, localStream, "true: " + isChannelReady);
                if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
                    createPeerConnection();
                    pc.addStream(localStream);
                    isStarted = true;
                    if (owner) {
                        console.log('creating offer for peer');
                        pc.createOffer(setLocalAndSendMessage,
                            function(event){console.log('createOffer() error: ', event);},
                            sdpConstraints
                        );
                    }
                }
            }
        }
    });
}
if(document.querySelector("#hangupbuttonId") !== null){
    document.querySelector("#hangupbuttonId").addEventListener("click", hangup);
}

if (clientId !== '') {
  socket.emit('create', clientId);
  console.log('Attempted to create clientId', clientId);
}

socket.on('created', function(room) {
  console.log('Created clientId ' + room);
  owner = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        function(error){console.log('Failed to create session description: ' + error.toString());},
        sdpConstraints
    );
    isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

//client

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
    console.log('Server says::', message);
    if (message === 'got user media') {
        console.log('>>>>>>> maybeStart() ', "false: " + isStarted, localStream, "true: " + isChannelReady);
        if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
            createPeerConnection();
            pc.addStream(localStream);
            isStarted = true;
            if (owner) {
                console.log('creating offer for peer');
                pc.createOffer(setLocalAndSendMessage,
                    function(event){console.log('createOffer() error: ', event);},
                    sdpConstraints
                );
            }
        }
    } else if (message.type === 'offer') {
        if(confirm("received offer, answer?")) {
            socket.emit('join', clientId);
            isChannelReady = true;
            isStarted = false;
            owner = false;
            console.log('>>>>>>> maybeStart() ', "false: " + isStarted, localStream, "true: " + isChannelReady);
            if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
                createPeerConnection();
                pc.addStream(localStream);
                isStarted = true;
                if (owner) {
                    console.log('creating offer for peer');
                    pc.createOffer(setLocalAndSendMessage,
                        function(event){console.log('createOffer() error: ', event);},
                        sdpConstraints
                    );
                }
            }
            pc.setRemoteDescription(new RTCSessionDescription(message));
            console.log('Sending answer to peer.');
            pc.createAnswer().then(
                setLocalAndSendMessage,
                function(error){console.log('Failed to create session description: ' + error.toString());},
                sdpConstraints
            );
        }
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

//GetUserMedia
//here is a good place to do browser checks for ie and safari (not supported)
navigator.mediaDevices.getUserMedia({audio: false, video: true})
    .then(function(stream) {
        var localVideo = document.querySelector('#localVideo');
        localVideo.src = window.URL.createObjectURL(stream);
        localStream = stream;
        sendMessage('got user media');
        if (owner && !isStarted && typeof localStream !== 'undefined' && isChannelReady) {
            createPeerConnection();
            pc.addStream(localStream);
            isStarted = true;
            if (owner) {
                console.log('creating offer for peer');
                pc.createOffer(setLocalAndSendMessage,
                    function(event){console.log('createOffer() error: ', event);},
                    sdpConstraints
                );
            }
        }
    }).catch(function(e) { alert('getUserMedia() error: ' + e.name);});

//PEER CONNECTION

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = function(event){console.log('Remote stream removed. Event: ', event);};
    console.log('Created RTCPeerConnnection');
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
  }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function handleRemoteStreamAdded(event) {
    var remoteVideo = document.querySelector('#remoteVideo');
    console.log('Remote stream added.');
    remoteVideo.src = window.URL.createObjectURL(event.stream);
    remoteStream = event.stream;
}

function setLocalAndSendMessage(sessionDescription) {
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
}

function stop() {
    isStarted = false;
    owner = true;
    //if room host, will do nothing
    socket.emit("leave", clientId);
    if(pc !== null && pc !== undefined) {
        pc.close();
        pc = null;
    }
}