'use strict';

/* SETUP
 =================================================================================================================== */
const mediaStreamConstraints = {
    video: true,
    // audio: true,
};

// Set up to exchange only video.
const offerOptions = {
    offerToReceiveVideo: 1,
};

// Define initial start time of the call (defined as connection between peers).
let startTime = null;

// Define peer connections, streams and video elements.
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const dataChannelSend = document.querySelector('textarea#dataChannelSend');
const dataChannelReceive = document.querySelector('textarea#dataChannelReceive');

let localStream;
let remoteStream;

let localPeerConnection;
let remotePeerConnection;

let localConnection;
let remoteConnection;

let sendChannel;
let receiveChannel;

let pcConstraint;
let dataConstraint;

/* ================================================================================================================= */


/* Define MediaStreams callbacks
 =================================================================================================================== */

// Sets the MediaStream as the video element src
function gotLocalMediaStream(mediaStream) {
    localVideo.srcObject = mediaStream;
    localStream = mediaStream;
    callButton.disabled = false;
}

// Handles error by logging a message to the console
function handleLocalMediaStreamError(error) {
    trace(`navigator.getUserMedia error: ${error.toString()}.`);
}

// Handles remote MediaStream success by adding it as the remoteVideo src.
function gotRemoteMediaStream(event) {
    const mediaStream = event.stream;
    remoteVideo.srcObject = mediaStream;
    remoteStream = mediaStream;
}

/* ================================================================================================================= */


/* Add behavior for video streams
 =================================================================================================================== */

// Logs a message with the id and size of a video element
function logVideoLoaded(event) {
    const video = event.target;
    trace(`${video.id} videoWidth: ${video.videoWidth}px, videoHeight: ${video.videoHeight}px.`);
}

// Logs a message with the id and size of a video element
// This event is fired when video begins streaming
function logResizedVideo(event) {
    logVideoLoaded(event);

    if (startTime) {
        const elapsedTime = window.performance.now() - startTime;
        startTime = null;
        trace(`Setup time: ${elapsedTime.toFixed(3)}ms.`);
    }
}

localVideo.addEventListener('loadedmetadata', logVideoLoaded);
remoteVideo.addEventListener('loadedmetadata', logVideoLoaded);
remoteVideo.addEventListener('onresize', logResizedVideo);

/* ================================================================================================================= */


/* Add behavior for messages
 =================================================================================================================== */

function sendData() {
    const data = dataChannelSend.value;
    sendChannel.send(data);
    dataChannelSend.value = null;
}

function closeDataChannels() {
    sendChannel.close();
    receiveChannel.close();
    localConnection.close();
    remoteConnection.close();

    localConnection = null;
    remoteConnection = null;

    startButton.disabled = false;
    sendButton.disabled = true;

    dataChannelSend.disabled = true;
    dataChannelSend.value = '';
    dataChannelReceive.value = '';
}

function gotDescription1(desc) {
    localConnection.setLocalDescription(desc);
    remoteConnection.setRemoteDescription(desc);
    remoteConnection.createAnswer().then(
        gotDescription2,
        onCreateSessionDescriptionError
    );
}

function gotDescription2(desc) {
    remoteConnection.setLocalDescription(desc);
    localConnection.setRemoteDescription(desc);
}

// Exchange info about network connection
function iceCallback1(event) {
    if (event.candidate) {
        remoteConnection.addIceCandidate(
            event.candidate
        ).then(
            onAddIceCandidateSuccess,
            onAddIceCandidateError
        );
    }
}

function iceCallback2(event) {
    if (event.candidate) {
        localConnection.addIceCandidate(
            event.candidate
        ).then(
            onAddIceCandidateSuccess,
            onAddIceCandidateError
        );
    }
}

function onReceiveMessageCallback(event) {
    const previousMessages = dataChannelReceive.value;
    dataChannelReceive.value = previousMessages ? `${previousMessages}${event.data}\n` : `${event.data}\n`;
    dataChannelReceive.scrollTop = dataChannelReceive.scrollHeight;
}

function onSendChannelStateChange() {
    const readyState = sendChannel.readyState;
    if (readyState === 'open') {
        dataChannelSend.disabled = false;
        dataChannelSend.focus();
        sendButton.disabled = false;
    } else {
        dataChannelSend.disabled = true;
        sendButton.disabled = true;
    }
}

function onReceiveChannelStateChange() {
    const readyState = receiveChannel.readyState;
    trace(`Receive channel state is: ${readyState}`);
}

function receiveChannelCallback(event) {
    receiveChannel = event.channel;
    receiveChannel.onmessage = onReceiveMessageCallback;
    receiveChannel.onopen = onReceiveChannelStateChange;
    receiveChannel.onclose = onReceiveChannelStateChange;
}

/* ================================================================================================================= */


/* Define RTC peer connection behavior
 =================================================================================================================== */

// Connects with new peer candidate.
function handleConnection(event) {
    const peerConnection = event.target;
    const iceCandidate = event.candidate;

    if (iceCandidate) {
        const newIceCandidate = new RTCIceCandidate(iceCandidate);
        const otherPeer = getOtherPeer(peerConnection);

        otherPeer.addIceCandidate(newIceCandidate)
            .then(() => handleConnectionSuccess(peerConnection))
            .catch((error) => handleConnectionFailure(peerConnection, error));
    }
}

// Logs succeeded connection
function handleConnectionSuccess(peerConnection) {
    trace(`${getPeerName(peerConnection)} addIceCandidate success.`);
}

// Logs failed connection
function handleConnectionFailure(peerConnection, error) {
    trace(`${getPeerName(peerConnection)} failed to add ICE Candidate:\n${error.toString()}.`);
}

// Logs changes to the connection state
function handleConnectionChange(event) {
    const peerConnection = event.target;
    console.log('ICE state change event: ', event);
    trace(`${getPeerName(peerConnection)} ICE state: ${peerConnection.iceConnectionState}.`);
}

// Logs error when setting session description fails.
function setSessionDescriptionError(error) {
    trace(`Failed to create session description: ${error.toString()}.`);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

// Logs success when setting session description.
function setDescriptionSuccess(peerConnection, functionName) {
    const peerName = getPeerName(peerConnection);
    trace(`${peerName} ${functionName} complete.`);
}

// Logs success when localDescription is set.
function setLocalDescriptionSuccess(peerConnection) {
    setDescriptionSuccess(peerConnection, 'setLocalDescription');
}

// Logs success when remoteDescription is set.
function setRemoteDescriptionSuccess(peerConnection) {
    setDescriptionSuccess(peerConnection, 'setRemoteDescription');
}

// Logs offer creation and sets peer connection session descriptions.
function createdOffer(description) {
    trace(`Offer from localPeerConnection:\n${description.sdp}`);

    trace('localPeerConnection setLocalDescription start.');
    localPeerConnection.setLocalDescription(description)
        .then(() => setLocalDescriptionSuccess(localPeerConnection))
        .catch(setSessionDescriptionError);

    trace('remotePeerConnection setRemoteDescription start.');
    remotePeerConnection.setRemoteDescription(description)
        .then(() => setRemoteDescriptionSuccess(remotePeerConnection))
        .catch(setSessionDescriptionError);

    trace('remotePeerConnection createAnswer start.');
    remotePeerConnection.createAnswer()
        .then(createdAnswer)
        .catch(setSessionDescriptionError);
}

// Logs answer to offer creation and sets peer connection session descriptions.
function createdAnswer(description) {
    trace(`Answer from remotePeerConnection:\n${description.sdp}.`);

    trace('remotePeerConnection setLocalDescription start.');
    remotePeerConnection.setLocalDescription(description)
        .then(() => setLocalDescriptionSuccess(remotePeerConnection))
        .catch(setSessionDescriptionError);

    trace('localPeerConnection setRemoteDescription start.');
    localPeerConnection.setRemoteDescription(description)
        .then(() => setRemoteDescriptionSuccess(localPeerConnection))
        .catch(setSessionDescriptionError);
}

function onAddIceCandidateSuccess() {
    trace('AddIceCandidate success.');
}

function onAddIceCandidateError(error) {
    trace('Failed to add Ice Candidate: ' + error.toString());
}

/* ================================================================================================================= */


/* Define and add behavior to buttons
 =================================================================================================================== */

// Define action buttons.
const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const sendButton = document.getElementById('sendButton');

// Set up initial action buttons status: disable call and hangup.
callButton.disabled = true;
hangupButton.disabled = true;
sendButton.disabled = true;

// Handles start button action: creates local MediaStream.
function startAction() {
    startButton.disabled = true;
    sendButton.disabled = false;

    let servers = null;
    pcConstraint = null;
    dataConstraint = null;

    // Add to global scope to make it visible in browser console
    window.localConnection = localConnection = new RTCPeerConnection(servers, pcConstraint);

    sendChannel = localConnection.createDataChannel('sendDataChannel', dataConstraint);

    localConnection.onicecandidate = iceCallback1;
    sendChannel.onopen = onSendChannelStateChange;
    sendChannel.onclose = onSendChannelStateChange;

    window.remoteConnection = remoteConnection = new RTCPeerConnection(servers, pcConstraint);

    remoteConnection.onicecandidate = iceCallback2;
    remoteConnection.ondatachannel = receiveChannelCallback;

    localConnection.createOffer().then(
        gotDescription1,
        onCreateSessionDescriptionError
    );

    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then(gotLocalMediaStream)
        .catch(handleLocalMediaStreamError);

}

// Handles call button action: creates peer connection.
function callAction() {
    callButton.disabled = true;
    hangupButton.disabled = false;

    startTime = window.performance.now();

    // Get local media stream tracks.
    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    
    if (videoTracks.length > 0) trace(`Using video device: ${videoTracks[0].label}.`);
    
    if (audioTracks.length > 0) trace(`Using audio device: ${audioTracks[0].label}.`);
    
    const servers = null;  // Allows for RTC server configuration.

    // Create peer connections and add behavior.
    localPeerConnection = new RTCPeerConnection(servers);

    localPeerConnection.addEventListener('icecandidate', handleConnection);
    localPeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);

    remotePeerConnection = new RTCPeerConnection(servers);
    trace('Created remote peer connection object remotePeerConnection.');

    remotePeerConnection.addEventListener('icecandidate', handleConnection);
    remotePeerConnection.addEventListener('iceconnectionstatechange', handleConnectionChange);
    remotePeerConnection.addEventListener('addstream', gotRemoteMediaStream);

    // Add local stream to connection and create offer to connect.
    localPeerConnection.addStream(localStream);

    localPeerConnection.createOffer(offerOptions)
        .then(createdOffer)
        .catch(setSessionDescriptionError);
}

// Handles hangup action: ends up call, closes connections and resets peers.
function hangupAction() {
    localPeerConnection.close();
    remotePeerConnection.close();
    localPeerConnection = null;
    remotePeerConnection = null;
    hangupButton.disabled = true;
    callButton.disabled = true;

    localStream.getTracks().forEach((track) => track.stop());
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    closeDataChannels();
}

// Add click event handlers for buttons.
startButton.addEventListener('click', startAction);
callButton.addEventListener('click', callAction);
hangupButton.addEventListener('click', hangupAction);
sendButton.addEventListener('click', sendData);

/* ================================================================================================================= */


/* Define helper functions
 =================================================================================================================== */

// Gets the "other" peer connection.
function getOtherPeer(peerConnection) {
    return (peerConnection === localPeerConnection) ? remotePeerConnection : localPeerConnection;
}

// Gets the name of a certain peer connection
function getPeerName(peerConnection) {
    return (peerConnection === localPeerConnection) ? 'localPeerConnection' : 'remotePeerConnection';
}

// Logs messages with their timings
function trace(text) {
    text = text.trim();
    const now = (window.performance.now() / 1000).toFixed(3);
    console.log(now, text);
}

/* ================================================================================================================= */
