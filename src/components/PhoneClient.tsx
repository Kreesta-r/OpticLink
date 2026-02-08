import { useEffect, useRef, useState } from 'react';

const SIGNALING_SERVER = 'ws://' + window.location.hostname + ':3001/ws';

export default function PhoneClient() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('Idle');
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        startCamera();
        connectSignaling();
        return () => {
            wsRef.current?.close();
            pcRef?.current?.close();
        };
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: 1280, height: 720 },
                audio: false
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setStatus('Camera Ready');
        } catch (e) {
            console.error(e);
            setStatus('Camera Error');
        }
    };

    const connectSignaling = () => {
        const ws = new WebSocket(SIGNALING_SERVER);
        wsRef.current = ws;

        ws.onopen = () => setStatus('Connected to Signaling');

        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'answer') {
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
            } else if (msg.type === 'ice-candidate') {
                await pcRef.current?.addIceCandidate(new RTCIceCandidate({ candidate: msg.candidate, sdpMid: msg.sdp_mid, sdpMLineIndex: msg.sdp_m_line_index }));
            }
        };
    };

    const startStream = async () => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        const stream = videoRef.current!.srcObject as MediaStream;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                wsRef.current?.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate.candidate,
                    sdp_mid: event.candidate.sdpMid,
                    sdp_m_line_index: event.candidate.sdpMLineIndex,
                    target: 'desktop'
                }));
            }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        wsRef.current?.send(JSON.stringify({
            type: 'offer',
            sdp: offer.sdp,
            target: 'desktop'
        }));

        setStatus('Streaming...');
    };

    return (
        <div style={{ background: '#000', height: '100vh', color: '#fff', display: 'flex', flexDirection: 'column' }}>
            <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', flex: 1, objectFit: 'cover' }} />
            <div style={{ padding: 20, background: 'rgba(0,0,0,0.5)', position: 'absolute', bottom: 0, width: '100%' }}>
                <p>Status: {status}</p>
                <button onClick={startStream} style={{ padding: '15px 30px', fontSize: 18, background: '#0ff', border: 'none', borderRadius: 8 }}>
                    Start Stream
                </button>
            </div>
        </div>
    );
}
