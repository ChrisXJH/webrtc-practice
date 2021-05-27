"use strict";

(() => {

    const RTC_CONFIGURATION = {
        iceServers: [
            {
                urls: [
                    'stun:stun1.l.google.com:19302',
                    'stun:stun2.l.google.com:19302'
                ]
            },
        ],
        iceCandidatePoolSize: 10,
      };

    const db = firebase.firestore();
    const peerConnection = new RTCPeerConnection(RTC_CONFIGURATION);
    const remoteStream = new MediaStream();

    const videoSelectElement = document.getElementById('videoInput');
    const audioSelectElement = document.getElementById('audioInput');

    const localVideoElement = document.getElementById('localVideo');
    const remoteVideoElement = document.getElementById('remoteVideo');

    const roomIdInput = document.getElementById('roomIdInput');
    const joinRoomBtn = document.getElementById('joinRoomBtn');

    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomIdText = document.getElementById('roomIdText');

    const getConnectedDevices = kind =>
        navigator.mediaDevices.enumerateDevices().then(devices =>
            devices.filter(device => device.kind === kind)
        );

    const requestUserMedia = async () => {
        const constraint = {
            video: {
                deviceId: videoSelectElement.value
            },
            audio: {
                deviceId: audioSelectElement.value
            }
        };

        const localStream = await navigator.mediaDevices.getUserMedia(constraint);

        localVideoElement.srcObject = localStream;

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream)
        });
    };

    const updateDevicesSelect = (selectElement, devices) => {
        selectElement.innerHTML = '';

        devices.forEach(device => {
            const option = document.createElement('option');

            option.value = device.deviceId;
            option.label = device.label;

            selectElement.add(option);
        });
    };

    const updateVideoInputSelect = devices => updateDevicesSelect(videoSelectElement, devices);

    const updateAudioInputSelect = devices => updateDevicesSelect(audioSelectElement, devices);

    const onVideoInputDevicesChange = async () => {
        const inputDevices = await getConnectedDevices('videoinput');

        updateVideoInputSelect(inputDevices);
    };

    const onAudioInputDevicesChange = async () => {
        const inputDevices = await getConnectedDevices('audioinput');

        updateAudioInputSelect(inputDevices);
    };

    const onInputDevicesChange = async () => {
        await onVideoInputDevicesChange();
        await onAudioInputDevicesChange();

        requestUserMedia();
    };

    const collectIceCandidates = async (roomRef, peerConnection, localName, remoteName) => {
        const candidatesCollection = roomRef.collection(localName);

        peerConnection.addEventListener('icecandidate', event => {
            if (event.candidate) {
                const json = event.candidate.toJSON();
                candidatesCollection.add(json);
            }
        });

        roomRef.collection(remoteName).onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    peerConnection.addIceCandidate(candidate);
                }
            });
        })
    };

    const createRoom = async () => {
        const offer = await peerConnection.createOffer();

        await peerConnection.setLocalDescription(offer);

        const room = {
            offer: {
                type: offer.type,
                sdp: offer.sdp
            }
        };

        const roomRef = await db.collection('rooms').add(room);
        const roomId = roomRef.id;

        collectIceCandidates(roomRef, peerConnection, 'callerCandidates', 'calleeCandidates');

        roomIdText.innerHTML = `Your room ID is <b>${roomId}</b>. Send it to your friend!`;

        roomRef.onSnapshot(async snapshot => {
            const data = snapshot.data();

            if (!peerConnection.currentRemoteDescription && data && data.answer) {
                const { answer } = data;

                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });
    };

    const joinRoom = async roomId => {
        const roomRef = db.collection('rooms').doc(`${roomId}`);
        const roomSnapshot = await roomRef.get();

        if (!roomSnapshot.exists) {
            alert(`Room ${roomId} does not exist.`);
            return;
        }

        collectIceCandidates(roomRef, peerConnection, 'calleeCandidates', 'callerCandidates');

        const { offer } = roomSnapshot.data();

        peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        const answer = await peerConnection.createAnswer();
        const roomUpdate = {
            answer: {
                type: answer.type,
                sdp: answer.sdp
            }
        };

        await peerConnection.setLocalDescription(answer);
        await roomRef.update(roomUpdate);
    };

    const main = async () => {
        onInputDevicesChange();

        remoteVideoElement.srcObject = remoteStream;

        peerConnection.addEventListener('track', event => {
            event.streams[0].getTracks().forEach(track => {
                console.log('Add a track to the remoteStream:', track);
                remoteStream.addTrack(track);
            });
        });
        
        [videoSelectElement, audioSelectElement].forEach(selectElement => {
            selectElement.addEventListener('change', () => {
                requestUserMedia();
            });
        });

        navigator.mediaDevices.addEventListener('devicechange', async () => {
            onInputDevicesChange();
        });

        joinRoomBtn.addEventListener('click', () => {
            const roomId = roomIdInput.value;

            joinRoom(roomId);
        });

        createRoomBtn.addEventListener('click', () => {
            createRoom();
        });

        peerConnection.addEventListener('connectionstatechange', () => {
            console.log('connectionState', peerConnection.connectionState);
        });
    };

    main();

})();
