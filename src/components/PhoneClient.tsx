import { useEffect, useRef, useState } from 'react';
import '../styles/theme.css';

const SIGNALING_SERVER = 'ws://' + window.location.hostname + ':3001/ws';

export default function PhoneClient() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState<'idle' | 'ready' | 'connecting' | 'streaming' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
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
                video: { facingMode: 'environment', width: 1920, height: 1080 },
                audio: false
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            setStatus('ready');
        } catch (e) {
            console.error(e);
            setStatus('error');
            setErrorMsg('Camera access denied. Please allow camera permissions.');
        }
    };

    const connectSignaling = () => {
        const ws = new WebSocket(SIGNALING_SERVER);
        wsRef.current = ws;

        ws.onopen = () => {
            if (status === 'idle') setStatus('ready');
        };

        ws.onerror = () => {
            setStatus('error');
            setErrorMsg('Cannot connect to desktop app. Make sure OpticLink is running.');
        };

        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'answer') {
                await pcRef.current?.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
                setStatus('streaming');
            } else if (msg.type === 'ice-candidate') {
                await pcRef.current?.addIceCandidate(new RTCIceCandidate({
                    candidate: msg.candidate,
                    sdpMid: msg.sdp_mid,
                    sdpMLineIndex: msg.sdp_m_line_index
                }));
            }
        };
    };

    const startStream = async () => {
        if (!videoRef.current?.srcObject) return;

        setStatus('connecting');

        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        const stream = videoRef.current.srcObject as MediaStream;
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
    };

    const getStatusText = () => {
        switch (status) {
            case 'idle': return 'Initializing...';
            case 'ready': return 'Camera Ready';
            case 'connecting': return 'Connecting...';
            case 'streaming': return 'Streaming to Desktop';
            case 'error': return 'Error';
        }
    };

    return (
        <div style={{
            background: 'var(--bg-primary)',
            height: '100vh',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
        }}>
            {/* Video Preview */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{
                    width: '100%',
                    flex: 1,
                    objectFit: 'cover',
                    background: '#000'
                }}
            />

            {/* Live Indicator */}
            {status === 'streaming' && (
                <div style={{
                    position: 'absolute',
                    top: 16,
                    left: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    background: 'var(--status-live)',
                    borderRadius: 'var(--border-radius)',
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'white',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                }}>
                    <span className="status-dot live" />
                    LIVE
                </div>
            )}

            {/* Control Bar */}
            <div style={{
                padding: 20,
                background: 'var(--bg-secondary)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16
            }}>
                {/* Status */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--text-secondary)',
                    fontSize: 14
                }}>
                    <span className={`status-dot ${status === 'streaming' ? 'live' : status === 'ready' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'}`} />
                    {getStatusText()}
                </div>

                {/* Error Message */}
                {status === 'error' && (
                    <p style={{
                        color: 'var(--accent-error)',
                        fontSize: 13,
                        textAlign: 'center',
                        maxWidth: 300
                    }}>
                        {errorMsg}
                    </p>
                )}

                {/* Start Button */}
                {status !== 'streaming' && status !== 'error' && (
                    <button
                        onClick={startStream}
                        disabled={status !== 'ready'}
                        className="btn btn-primary"
                        style={{
                            padding: '16px 48px',
                            fontSize: 16,
                            borderRadius: 'var(--border-radius-lg)'
                        }}
                    >
                        {status === 'connecting' ? 'Connecting...' : 'Start Streaming'}
                    </button>
                )}

                {/* Streaming Controls */}
                {status === 'streaming' && (
                    <div style={{ display: 'flex', gap: 12 }}>
                        <button
                            className="btn btn-danger"
                            style={{ padding: '12px 32px' }}
                            onClick={() => {
                                pcRef.current?.close();
                                setStatus('ready');
                            }}
                        >
                            Stop Stream
                        </button>
                    </div>
                )}

                {/* Branding */}
                <p style={{
                    color: 'var(--text-muted)',
                    fontSize: 11,
                    marginTop: 8
                }}>
                    OpticLink v0.1.0
                </p>
            </div>
        </div>
    );
}
