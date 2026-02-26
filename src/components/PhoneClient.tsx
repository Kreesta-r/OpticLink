import { useEffect, useRef, useState } from 'react';
import '../styles/theme.css';
import './PhoneClient.css';

const SIGNALING_SERVER = 'ws://' + window.location.hostname + ':3001/ws';

// Flexible constraints - many phones fail with strict 1920x1080 or facingMode: 'environment'
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 360 },
    facingMode: { ideal: 'user', exact: false }
};

export default function PhoneClient() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [status, setStatus] = useState<'idle' | 'ready' | 'connecting' | 'streaming' | 'error'>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const answeredRef = useRef(false);

    useEffect(() => {
        startCamera();
        connectSignaling();
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            wsRef.current?.close();
            pcRef.current?.close();
        };
    }, []);

    const startCamera = async () => {
        try {
            // Try flexible constraints first
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: VIDEO_CONSTRAINTS,
                    audio: false
                });
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }
            streamRef.current = stream;
            setStatus('ready');
            setTimeout(() => {
                if (videoRef.current && stream) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }
            }, 0);
        } catch (e) {
            console.error(e);
            setStatus('error');
            setErrorMsg('Camera access denied. Please allow camera permissions in your browser.');
        }
    };

    const connectSignaling = () => {
        const ws = new WebSocket(SIGNALING_SERVER);
        wsRef.current = ws;

        ws.onopen = () => {
            ws.send(JSON.stringify({
                type: 'phone-hello',
                deviceName: navigator.userAgent.split(/[()]/)[1]?.trim() || 'Mobile Device',
                platform: navigator.platform || 'unknown'
            }));
            setStatus(s => (s === 'idle' ? 'ready' : s));
        };

        ws.onerror = () => {
            setStatus('error');
            setErrorMsg('Cannot connect to desktop app. Make sure OpticLink is running on the same network.');
        };

        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'answer') {
                try {
                    answeredRef.current = true;
                    if (pcRef.current) {
                        await pcRef.current.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp: msg.sdp }));
                    }
                    setStatus('streaming');
                } catch (e) {
                    setStatus('error');
                    setErrorMsg('Invalid response from desktop. Try again.');
                }
            } else if (msg.type === 'ice-candidate') {
                if (pcRef.current) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate({
                        candidate: msg.candidate,
                        sdpMid: msg.sdp_mid,
                        sdpMLineIndex: msg.sdp_m_line_index
                    }));
                }
            }
        };
    };

    const startStream = async () => {
        const stream = streamRef.current || videoRef.current?.srcObject as MediaStream;
        if (!stream?.getVideoTracks().length) {
            setStatus('error');
            setErrorMsg('No camera. Please allow camera access.');
            return;
        }
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
            setStatus('error');
            setErrorMsg('Not connected. OpticLink must be running on your computer. Same Wi‑Fi?');
            return;
        }

        setStatus('connecting');
        setErrorMsg('');
        answeredRef.current = false;

        try {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        // Force H.264 - desktop virtual cam expects H.264
        try {
            const transceivers = pc.getTransceivers().filter(t => t.receiver.track?.kind === 'video');
            const caps = RTCRtpReceiver.getCapabilities?.('video');
            if (transceivers.length > 0 && caps?.codecs?.length) {
                const pref = ['video/H264', 'video/h264', 'video/VP8', 'video/VP9'];
                const sorted = [...caps.codecs].sort((a, b) => {
                    const i = pref.indexOf(a.mimeType);
                    const j = pref.indexOf(b.mimeType);
                    return (i < 0 ? 99 : i) - (j < 0 ? 99 : j);
                });
                transceivers[0].setCodecPreferences?.(sorted);
            }
        } catch (_) { /* fallback to default */ }

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

        const timeout = setTimeout(() => {
            if (!answeredRef.current && pcRef.current === pc) {
                setStatus('error');
                setErrorMsg('No response from desktop. Make sure you clicked "Start Virtual Cam" first, and both devices are on the same Wi‑Fi.');
                pc.close();
                pcRef.current = null;
            }
        }, 15000);
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                answeredRef.current = true;
                clearTimeout(timeout);
            }
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                if (pcRef.current === pc && !answeredRef.current) {
                    setStatus('error');
                    setErrorMsg('Connection failed. Check that both devices are on the same Wi‑Fi.');
                }
            }
        };
        } catch (e) {
            setStatus('error');
            setErrorMsg(e instanceof Error ? e.message : 'Failed to start streaming.');
        }
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
        <div className="phone-client-root">
            {/* Video Preview */}
            <div className="phone-video-wrap">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="phone-video"
                />
                {status === 'streaming' && (
                    <div className="phone-live-badge">
                        <span className="status-dot live" />
                        LIVE
                    </div>
                )}
            </div>

            {/* Control Bar - responsive, safe-area aware */}
            <div className="phone-control-bar">
                <div className="phone-status-row">
                    <span className={`status-dot ${status === 'streaming' ? 'live' : status === 'ready' ? 'connected' : status === 'connecting' ? 'connecting' : 'disconnected'}`} />
                    {getStatusText()}
                </div>

                {status === 'error' && (
                    <p className="phone-error-msg">{errorMsg}</p>
                )}

                {status !== 'streaming' && status !== 'error' && (
                    <button
                        onClick={startStream}
                        disabled={status !== 'ready'}
                        className="btn btn-primary phone-start-btn"
                    >
                        {status === 'connecting' ? 'Connecting...' : 'Start Streaming'}
                    </button>
                )}

                {status === 'streaming' && (
                    <button
                        className="btn btn-danger phone-stop-btn"
                        onClick={() => {
                            pcRef.current?.close();
                            setStatus('ready');
                        }}
                    >
                        Stop Stream
                    </button>
                )}

                {status === 'ready' && (
                    <p className="phone-tip">Tip: Turn on Virtual Camera on desktop first, then tap Start Streaming</p>
                )}
                <p className="phone-branding">OpticLink v0.1.0</p>
            </div>
        </div>
    );
}
