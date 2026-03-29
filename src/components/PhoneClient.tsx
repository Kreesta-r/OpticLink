import { useEffect, useRef, useState, useCallback } from 'react';
import '../styles/theme.css';
import './PhoneClient.css';

// WebSocket URL — WSS when served over HTTPS (phone), WS otherwise
const SIGNALING_SERVER =
    (window.location.protocol === 'https:' ? 'wss' : 'ws') +
    '://' +
    window.location.hostname +
    ':' +
    window.location.port +
    '/ws';

type Status = 'idle' | 'ready' | 'connecting' | 'streaming' | 'error';
type FacingMode = 'environment' | 'user';

function formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Pick the best MIME type that MediaRecorder supports on this device. */
function getSupportedMimeType(): string {
    const candidates = [
        'video/webm; codecs=vp9',
        'video/webm; codecs=vp8',
        'video/webm',
    ];
    for (const t of candidates) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
}

const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

export default function PhoneClient() {
    const videoRef       = useRef<HTMLVideoElement>(null);
    const streamRef      = useRef<MediaStream | null>(null);
    const wsRef          = useRef<WebSocket | null>(null);
    const pcRef          = useRef<RTCPeerConnection | null>(null);   // vcam WebRTC (Rust)
    const recorderRef    = useRef<MediaRecorder | null>(null);       // preview relay
    const answeredRef    = useRef(false);
    const timeoutRef     = useRef<number | null>(null);
    const durationRef    = useRef<number | null>(null);
    const helloIntervalRef = useRef<number | null>(null);

    const [status, setStatus]             = useState<Status>('idle');
    const [errorMsg, setErrorMsg]         = useState('');
    const [facingMode, setFacingMode]     = useState<FacingMode>('environment');
    const [torchOn, setTorchOn]           = useState(false);
    const [torchSupported, setTorchSupported] = useState(false);
    const [duration, setDuration]         = useState(0);
    const [wsReady, setWsReady]           = useState(false);

    // ── Camera initialisation ──────────────────────────────────────────────
    const startCamera = useCallback(async (facing: FacingMode = 'environment') => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setTorchOn(false);
        setTorchSupported(false);

        const constraints: MediaStreamConstraints = {
            video: {
                facingMode: { ideal: facing },
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 360 },
            },
            audio: false,
        };

        try {
            let stream: MediaStream;
            try {
                stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }

            streamRef.current = stream;

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play().catch(() => {});
            }

            const [track] = stream.getVideoTracks();
            const caps = track.getCapabilities?.() as any;
            if (caps?.torch) setTorchSupported(true);

            setStatus(s => (s === 'idle' || s === 'error' ? 'ready' : s));
        } catch (e: any) {
            console.error('[Camera]', e);
            setStatus('error');
            if (e?.name === 'NotAllowedError' || e?.name === 'PermissionDeniedError') {
                setErrorMsg('Camera access denied. Please allow camera permissions in your browser settings.');
            } else if (e?.name === 'NotFoundError') {
                setErrorMsg('No camera found on this device.');
            } else {
                setErrorMsg('Could not access camera: ' + (e?.message || 'Unknown error'));
            }
        }
    }, []);

    // ── Torch toggle ──────────────────────────────────────────────────────
    const toggleTorch = useCallback(async () => {
        const track = streamRef.current?.getVideoTracks()[0];
        if (!track) return;
        const newVal = !torchOn;
        try {
            await (track as any).applyConstraints({ advanced: [{ torch: newVal }] });
            setTorchOn(newVal);
        } catch {
            setTorchSupported(false);
        }
    }, [torchOn]);

    // ── Camera flip ───────────────────────────────────────────────────────
    const flipCamera = useCallback(async () => {
        const newFacing: FacingMode = facingMode === 'environment' ? 'user' : 'environment';
        setFacingMode(newFacing);
        await startCamera(newFacing);
        if (streamRef.current) {
            const [newTrack] = streamRef.current.getVideoTracks();
            if (newTrack) {
                const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
                if (sender) sender.replaceTrack(newTrack).catch(console.error);
            }
        }
    }, [facingMode, startCamera]);

    // ── Signaling ─────────────────────────────────────────────────────────
    const connectSignaling = useCallback(() => {
        const ws = new WebSocket(SIGNALING_SERVER);
        wsRef.current = ws;

        ws.onopen = () => {
            const helloMsg = JSON.stringify({
                type: 'phone-hello',
                deviceName: (() => {
                    const ua = navigator.userAgent;
                    const match = ua.match(/\(([^)]+)\)/);
                    return match?.[1]?.split(';')[0]?.trim() || 'Mobile Device';
                })(),
                platform: navigator.platform || 'unknown',
            });

            ws.send(helloMsg);
            setWsReady(true);
            setStatus(s => (s === 'idle' || s === 'error' ? 'ready' : s));

            // Re-broadcast every 5 s so the desktop catches it even if it connects late
            if (helloIntervalRef.current) clearInterval(helloIntervalRef.current);
            helloIntervalRef.current = window.setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(helloMsg);
            }, 5000);
        };

        ws.onerror = () => { setWsReady(false); };

        ws.onclose = () => {
            if (helloIntervalRef.current) {
                clearInterval(helloIntervalRef.current);
                helloIntervalRef.current = null;
            }
            setWsReady(false);
            setTimeout(() => {
                if (status !== 'streaming') connectSignaling();
            }, 3000);
        };

        ws.onmessage = async (event) => {
            let msg: any;
            try { msg = JSON.parse(event.data); } catch { return; }

            // vcam answer from Rust WebRTC client
            if (msg.type === 'answer' && !msg.for) {
                try {
                    answeredRef.current = true;
                    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
                    if (pcRef.current) {
                        await pcRef.current.setRemoteDescription(
                            new RTCSessionDescription({ type: 'answer', sdp: msg.sdp })
                        );
                    }
                    setStatus('streaming');
                    startDurationTimer();
                } catch {
                    setStatus('error');
                    setErrorMsg('Invalid response from desktop. Try again.');
                }

            // vcam ICE candidates from Rust
            } else if (msg.type === 'ice-candidate') {
                if (pcRef.current) {
                    try {
                        await pcRef.current.addIceCandidate(new RTCIceCandidate({
                            candidate: msg.candidate,
                            sdpMid: msg.sdp_mid,
                            sdpMLineIndex: msg.sdp_m_line_index,
                        }));
                    } catch {}
                }
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const startDurationTimer = () => {
        setDuration(0);
        if (durationRef.current) clearInterval(durationRef.current);
        durationRef.current = window.setInterval(() => setDuration(d => d + 1), 1000);
    };

    const stopDurationTimer = () => {
        if (durationRef.current) { clearInterval(durationRef.current); durationRef.current = null; }
        setDuration(0);
    };

    // ── Mount / unmount ───────────────────────────────────────────────────
    useEffect(() => {
        startCamera('environment');
        connectSignaling();
        return () => {
            streamRef.current?.getTracks().forEach(t => t.stop());
            wsRef.current?.close();
            pcRef.current?.close();
            recorderRef.current?.stop();
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (durationRef.current) clearInterval(durationRef.current);
            if (helloIntervalRef.current) clearInterval(helloIntervalRef.current);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Start streaming ───────────────────────────────────────────────────
    const startStream = async () => {
        if (!streamRef.current?.getVideoTracks().length) {
            setStatus('error');
            setErrorMsg('No camera available. Please allow camera access.');
            return;
        }
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
            setStatus('error');
            setErrorMsg('Not connected to OpticLink desktop. Make sure it is running on the same Wi-Fi.');
            return;
        }

        setStatus('connecting');
        setErrorMsg('');
        answeredRef.current = false;

        try {
            // ── 1. vcam WebRTC peer connection (for Rust virtual camera) ───
            const vcamPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = vcamPc;

            streamRef.current!.getTracks().forEach(track =>
                vcamPc.addTrack(track, streamRef.current!)
            );

            // Prefer H264 for the virtual camera pipeline (Rust assembler expects it)
            try {
                const transceivers = vcamPc.getTransceivers().filter(t => t.sender.track?.kind === 'video');
                const caps = RTCRtpSender.getCapabilities?.('video');
                if (transceivers.length > 0 && caps?.codecs?.length) {
                    const order = ['video/H264', 'video/VP8', 'video/VP9', 'video/AV1'];
                    const sorted = [...caps.codecs].sort((a, b) => {
                        const ia = order.indexOf(a.mimeType);
                        const ib = order.indexOf(b.mimeType);
                        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                    });
                    transceivers[0].setCodecPreferences?.(sorted);
                }
            } catch {}

            vcamPc.onicecandidate = (event) => {
                if (event.candidate) {
                    wsRef.current?.send(JSON.stringify({
                        type: 'ice-candidate',
                        candidate: event.candidate.candidate,
                        sdp_mid: event.candidate.sdpMid,
                        sdp_m_line_index: event.candidate.sdpMLineIndex,
                        from: 'vcam',
                    }));
                }
            };

            vcamPc.onconnectionstatechange = () => {
                if (vcamPc.connectionState === 'connected') {
                    answeredRef.current = true;
                    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
                }
                if (
                    (vcamPc.connectionState === 'failed' || vcamPc.connectionState === 'disconnected') &&
                    pcRef.current === vcamPc
                ) {
                    stopDurationTimer();
                    // Don't show error — preview still works via WebSocket relay
                }
            };

            const vcamOffer = await vcamPc.createOffer();
            await vcamPc.setLocalDescription(vcamOffer);
            wsRef.current?.send(JSON.stringify({ type: 'offer', sdp: vcamOffer.sdp }));

            // ── 2. Preview relay via MediaRecorder → WebSocket ────────────
            const mimeType = getSupportedMimeType();
            if (mimeType && streamRef.current) {
                try {
                    // Tell the desktop to expect a stream with this MIME type
                    wsRef.current?.send(JSON.stringify({ type: 'preview-start', mimeType }));

                    const recorder = new MediaRecorder(streamRef.current, {
                        mimeType,
                        videoBitsPerSecond: 800_000,
                    });

                    recorder.ondataavailable = (e) => {
                        if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                            wsRef.current.send(e.data);
                        }
                    };

                    recorder.onerror = (e) => {
                        console.error('[Recorder] error:', e);
                    };

                    recorder.start(250); // 250 ms chunks ≈ ~250 ms latency
                    recorderRef.current = recorder;
                } catch (recErr) {
                    console.warn('[Preview] MediaRecorder failed:', recErr);
                    // Preview unavailable — vcam WebRTC still works
                }
            } else {
                console.warn('[Preview] No supported MediaRecorder MIME type on this device');
            }

            // ── Timeout waiting for vcam answer ────────────────────────────
            timeoutRef.current = window.setTimeout(() => {
                if (!answeredRef.current && pcRef.current === vcamPc) {
                    // vcam timed out — that's OK as long as preview relay is working
                    console.warn('[vcam] No answer from Rust WebRTC client after 15s');
                    timeoutRef.current = null;
                }
            }, 15000);

            // Move status to streaming regardless — preview relay drives the feed
            setStatus('streaming');
            startDurationTimer();

        } catch (e: any) {
            setStatus('error');
            setErrorMsg(e instanceof Error ? e.message : 'Failed to start streaming.');
        }
    };

    // ── Stop streaming ────────────────────────────────────────────────────
    const stopStream = () => {
        // Stop vcam WebRTC
        pcRef.current?.close();
        pcRef.current = null;

        // Stop preview relay
        if (recorderRef.current) {
            try { recorderRef.current.stop(); } catch {}
            recorderRef.current = null;
        }
        wsRef.current?.send(JSON.stringify({ type: 'preview-stop' }));

        stopDurationTimer();
        setStatus('ready');
    };

    // ── Retry ─────────────────────────────────────────────────────────────
    const retry = async () => {
        setErrorMsg('');
        setStatus('idle');
        await startCamera(facingMode);
        if (wsRef.current?.readyState !== WebSocket.OPEN) connectSignaling();
    };

    // ── Status indicators ─────────────────────────────────────────────────
    const statusDotClass = status === 'streaming' ? 'live'
        : status === 'ready' ? 'connected'
        : status === 'connecting' ? 'connecting'
        : 'disconnected';

    const statusLabel = status === 'idle' ? 'Initializing...'
        : status === 'ready' ? (wsReady ? 'Ready to Stream' : 'Connecting to desktop...')
        : status === 'connecting' ? 'Connecting...'
        : status === 'streaming' ? `Live · ${formatDuration(duration)}`
        : 'Error';

    return (
        <div className="phone-root">
            {/* Full-screen camera preview */}
            <div className="phone-viewport">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="phone-video"
                />

                {/* Top-left: LIVE badge or status */}
                <div className="phone-top-left">
                    {status === 'streaming' ? (
                        <div className="phone-live-badge">
                            <span className="status-dot live" />
                            LIVE
                        </div>
                    ) : (
                        <div className="phone-status-pill">
                            <span className={`status-dot ${statusDotClass}`} />
                            <span className="phone-status-text">{statusLabel}</span>
                        </div>
                    )}
                </div>

                {/* Top-right: camera controls */}
                <div className="phone-top-right">
                    {torchSupported && (
                        <button
                            className={`phone-icon-btn ${torchOn ? 'active' : ''}`}
                            onClick={toggleTorch}
                            title={torchOn ? 'Turn off torch' : 'Turn on torch'}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6l-2 4h-4l-2-4" />
                                <path d="M10 10v10a2 2 0 0 0 4 0V10" />
                                <path d="M8 6h8" />
                            </svg>
                        </button>
                    )}
                    <button
                        className="phone-icon-btn"
                        onClick={flipCamera}
                        title="Flip camera"
                        disabled={status === 'streaming'}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 7h-3a2 2 0 0 1-2-2V2" />
                            <path d="M9 2H4a2 2 0 0 0-2 2v4" />
                            <path d="M4 17H2v3a2 2 0 0 0 2 2h3" />
                            <path d="M15 22h3a2 2 0 0 0 2-2v-3" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </button>
                </div>

                {/* Overlay: connecting spinner */}
                {status === 'connecting' && (
                    <div className="phone-overlay-center">
                        <div className="phone-spinner" />
                        <p className="phone-overlay-text">Connecting...</p>
                    </div>
                )}
            </div>

            {/* Bottom control bar */}
            <div className="phone-bar">
                {status === 'error' && (
                    <div className="phone-error-card">
                        <p className="phone-error-msg">{errorMsg}</p>
                        <button className="btn btn-primary phone-btn" onClick={retry}>
                            Try Again
                        </button>
                    </div>
                )}

                {status !== 'streaming' && status !== 'error' && (
                    <button
                        className="btn btn-primary phone-btn phone-start-btn"
                        onClick={startStream}
                        disabled={status !== 'ready' || !wsReady}
                    >
                        {status === 'connecting' ? (
                            <><span className="phone-btn-spinner" /> Connecting...</>
                        ) : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                                Start Streaming
                            </>
                        )}
                    </button>
                )}

                {status === 'streaming' && (
                    <button className="btn btn-danger phone-btn phone-stop-btn" onClick={stopStream}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                        </svg>
                        Stop Streaming
                    </button>
                )}

                {status === 'ready' && wsReady && (
                    <p className="phone-tip">
                        Tap Start Streaming to send your camera to the desktop
                    </p>
                )}
                {status === 'ready' && !wsReady && (
                    <p className="phone-tip phone-tip-warn">
                        Waiting for desktop app connection...
                    </p>
                )}

                <p className="phone-branding">OpticLink v0.2.0</p>
            </div>
        </div>
    );
}
