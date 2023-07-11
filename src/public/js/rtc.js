import h from './helpers.js';

$(window).on( 'load', () => {
    $('.room-comm').removeAttr( 'hidden' );

    var pc = [];

    let socket = io();

    var allUrlParams = getAllUrlParams(),
        toUserId = allUrlParams['toUserId'] ?? '',
        currentUserId = allUrlParams['fromUserId'] ?? '',
        myStream = '',
        screen = '',
        recordedStream = [],
        mediaRecorder = '';

    //Get user video by default
    getAndSetUserStream();

    socket.on( 'connect', () => {
        // socket.on('current_user_id', (userID) => {
        //     currentUserId = userID;
        // });

        // socket.emit( 'subscribe_video_call', {
        //     toId: toUserId,
        //     socketId: currentUserId
        // } );

        // socket.on( 'new user', ( data ) => {
        //     socket.emit( 'newUserStart', { to: toUserId, sender: currentUserId } );
        //     pc.push( data.socketId );
        //     init( true, data.socketId );
        // } );

        // socket.on( 'newUserStart', ( data ) => {
        //     pc.push( data.sender );
        //     init( false, data.sender );
        // } );

        pc.push( toUserId );
        init( true, toUserId );
        pc.push( currentUserId );
        init( false, currentUserId );

        socket.on( 'ice candidates', async ( data ) => {
            data.candidate ? await pc[data.sender].addIceCandidate( new RTCIceCandidate( data.candidate ) ) : '';
        } );

        socket.on( 'sdp', async ( data ) => {
            if ( data.description.type === 'offer' ) {
                data.description ? await pc[data.sender].setRemoteDescription( new RTCSessionDescription( data.description ) ) : '';

                h.getUserFullMedia().then( async ( stream ) => {
                    if ( !$('#local').srcObject ) {
                        h.setLocalStream( stream );
                    }

                    //save my stream
                    myStream = stream;

                    stream.getTracks().forEach( ( track ) => {
                        pc[data.sender].addTrack( track, stream );
                    } );

                    let answer = await pc[data.sender].createAnswer();

                    await pc[data.sender].setLocalDescription( answer );

                    socket.emit( 'sdp', { description: pc[data.sender].localDescription, to: data.sender, sender: currentUserId } );
                } ).catch( ( e ) => {
                    console.error( e );
                } );
            } else if ( data.description.type === 'answer' ) {
                await pc[data.sender].setRemoteDescription( new RTCSessionDescription( data.description ) );
            }
        } );
    } );

    function getAllUrlParams() {
        let url = new URL(window.location.href),
            params = url.searchParams,
            result = []

        params.forEach((value, key) => {
            result[key] = value
        })

        return result;
    }

    function getAndSetUserStream() {
        h.getUserFullMedia().then( ( stream ) => {
            myStream = stream;

            h.setLocalStream( stream );
        } ).catch( ( e ) => {
            console.error( `stream error: ${ e }` );
        } );
    }

    async function init( createOffer, partnerName ) {
        pc[partnerName] = new RTCPeerConnection( h.getIceServer() );

        if ( screen && screen.getTracks().length ) {
            screen.getTracks().forEach( ( track ) => {
                pc[partnerName].addTrack( track, screen );//should trigger negotiationneeded event
            } );
        } else if ( myStream ) {
            myStream.getTracks().forEach( ( track ) => {
                pc[partnerName].addTrack( track, myStream );//should trigger negotiationneeded event
            } );
        } else {
            await h.getUserFullMedia().then( ( stream ) => {
                //save my stream
                myStream = stream;

                stream.getTracks().forEach( ( track ) => {
                    pc[partnerName].addTrack( track, stream );//should trigger negotiationneeded event
                } );

                h.setLocalStream( stream );
            } ).catch( ( e ) => {
                console.error( `stream error: ${ e }` );
            } );
        }

        //create offer
        if ( createOffer ) {
            pc[partnerName].onnegotiationneeded = async () => {
                let offer = await pc[partnerName].createOffer();

                await pc[partnerName].setLocalDescription( offer );

                socket.emit( 'sdp', { description: pc[partnerName].localDescription, to: partnerName, sender: currentUserId } );
            };
        }

        //send ice candidate to partnerNames
        pc[partnerName].onicecandidate = ( { candidate } ) => {
            socket.emit( 'ice candidates', { candidate: candidate, to: partnerName, sender: currentUserId } );
        };

        //add
        pc[partnerName].ontrack = ( e ) => {
            let str = e.streams[0];
            if ( $( `#${ partnerName }-video` ) ) {
                $( `#${ partnerName }-video` ).srcObject = str;
            }

            else {
                //video elem
                let newVid = document.createElement( 'video' );
                newVid.id = `${ partnerName }-video`;
                newVid.srcObject = str;
                newVid.autoplay = true;
                newVid.className = 'remote-video';

                //video controls elements
                let controlDiv = document.createElement( 'div' );
                controlDiv.className = 'remote-video-controls';
                controlDiv.innerHTML = `<i class="fa fa-microphone text-white pr-3 mute-remote-mic" title="Mute"></i>
                    <i class="fa fa-expand text-white expand-remote-video" title="Expand"></i>`;

                //create a new div for card
                let cardDiv = document.createElement( 'div' );
                cardDiv.className = 'card card-sm';
                cardDiv.id = partnerName;
                cardDiv.appendChild( newVid );
                cardDiv.appendChild( controlDiv );

                //put div in main-section elem
                document.getElementById( 'videos' ).appendChild( cardDiv );

                h.adjustVideoElemSize();
            }
        };

        pc[partnerName].onconnectionstatechange = ( d ) => {
            switch ( pc[partnerName].iceConnectionState ) {
                case 'disconnected':
                case 'failed':
                    h.closeVideo( partnerName );
                    break;

                case 'closed':
                    h.closeVideo( partnerName );
                    break;
            }
        };

        pc[partnerName].onsignalingstatechange = ( d ) => {
            switch ( pc[partnerName].signalingState ) {
                case 'closed':
                    console.log( "Signalling state is 'closed'" );
                    h.closeVideo( partnerName );
                    break;
            }
        };
    }

    function shareScreen() {
        h.shareScreen().then( ( stream ) => {
            h.toggleShareIcons( true );

            //disable the video toggle btns while sharing screen. This is to ensure clicking on the btn does not interfere with the screen sharing
            //It will be enabled was user stopped sharing screen
            h.toggleVideoBtnDisabled( true );

            //save my screen stream
            screen = stream;

            //share the new stream with all partners
            broadcastNewTracks( stream, 'video', false );

            //When the stop sharing button shown by the browser is clicked
            $(screen.getVideoTracks()[0]).on( 'ended', () => {
                stopSharingScreen();
            } );
        } ).catch( ( e ) => {
            console.error( e );
        } );
    }

    function stopSharingScreen() {
        //enable video toggle btn
        h.toggleVideoBtnDisabled( false );

        return new Promise( ( res, rej ) => {
            screen.getTracks().length ? screen.getTracks().forEach( track => track.stop() ) : '';

            res();
        } ).then( () => {
            h.toggleShareIcons( false );
            broadcastNewTracks( myStream, 'video' );
        } ).catch( ( e ) => {
            console.error( e );
        } );
    }

    function broadcastNewTracks( stream, type, mirrorMode = true ) {
        h.setLocalStream( stream, mirrorMode );

        let track = type == 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];

        for ( let p in pc ) {
            let pName = pc[p];

            if ( typeof pc[pName] == 'object' ) {
                h.replaceTrack( track, pc[pName] );
            }
        }
    }

    function toggleRecordingIcons( isRecording ) {
        let e = $('#record');

        if ( isRecording ) {
            e.attr( 'title', 'Stop recording' );
            e[0].classList.add( 'text-danger' );
            e[0].classList.remove( 'text-white' );
        }

        else {
            e.attr( 'title', 'Record' );
            e[0].classList.add( 'text-white' );
            e[0].classList.remove( 'text-danger' );
        }
    }

    function startRecording( stream ) {
        mediaRecorder = new MediaRecorder( stream, {
            mimeType: 'video/webm;codecs=vp9'
        } );

        mediaRecorder.start( 1000 );
        toggleRecordingIcons( true );

        mediaRecorder.ondataavailable = function ( e ) {
            recordedStream.push( e.data );
        };

        mediaRecorder.onstop = function () {
            toggleRecordingIcons( false );

            h.saveRecordedStream( recordedStream, username );

            setTimeout( () => {
                recordedStream = [];
            }, 3000 );
        };

        mediaRecorder.onerror = function ( e ) {
            console.error( e );
        };
    }

    $('#toggle-video').on( 'click', ( e ) => {
        e.preventDefault();

        let elem = $(this)

        if ( myStream.getVideoTracks()[0].enabled ) {
            e.target.classList.remove( 'fa-video' );
            e.target.classList.add( 'fa-video-slash' );
            elem.attr( 'title', 'Show Video' );

            myStream.getVideoTracks()[0].enabled = false;
        }

        else {
            e.target.classList.remove( 'fa-video-slash' );
            e.target.classList.add( 'fa-video' );
            elem.attr( 'title', 'Hide Video' );

            myStream.getVideoTracks()[0].enabled = true;
        }

        broadcastNewTracks( myStream, 'video' );
    } );

    $('#toggle-mute').on( 'click', ( e ) => {
        e.preventDefault();

        let elem = $(this);

        if ( myStream.getAudioTracks()[0].enabled ) {
            e.target.classList.remove( 'fa-microphone-alt' );
            e.target.classList.add( 'fa-microphone-alt-slash' );
            elem.attr( 'title', 'Unmute' );

            myStream.getAudioTracks()[0].enabled = false;
        } else {
            e.target.classList.remove( 'fa-microphone-alt-slash' );
            e.target.classList.add( 'fa-microphone-alt' );
            elem.attr( 'title', 'Mute' );

            myStream.getAudioTracks()[0].enabled = true;
        }

        broadcastNewTracks( myStream, 'audio' );
    } );

    $('#share-screen').on( 'click', ( e ) => {
        e.preventDefault();

        if ( screen && screen.getVideoTracks().length && screen.getVideoTracks()[0].readyState != 'ended' ) {
            stopSharingScreen();
        } else {
            shareScreen();
        }
    } );

    $('#record').on( 'click', ( e ) => {
        if ( !mediaRecorder || mediaRecorder.state == 'inactive' ) {
            h.toggleModal( 'recording-options-modal', true );
        } else if ( mediaRecorder.state == 'paused' ) {
            mediaRecorder.resume();
        } else if ( mediaRecorder.state == 'recording' ) {
            mediaRecorder.stop();
        }
    } );

    $('#record-screen').on( 'click', () => {
        h.toggleModal( 'recording-options-modal', false );

        if ( screen && screen.getVideoTracks().length ) {
            startRecording( screen );
        } else {
            h.shareScreen().then( ( screenStream ) => {
                startRecording( screenStream );
            } ).catch( () => { } );
        }
    } );

    $('#record-video').on( 'click', () => {
        h.toggleModal( 'recording-options-modal', false );

        if ( myStream && myStream.getTracks().length ) {
            startRecording( myStream );
        } else {
            h.getUserFullMedia().then( ( videoStream ) => {
                startRecording( videoStream );
            } ).catch( () => { } );
        }
    } );
} );