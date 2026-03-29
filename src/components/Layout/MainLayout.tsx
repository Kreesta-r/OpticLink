import { useState, useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from './Sidebar';
import PreviewPanel from './PreviewPanel';
import ControlBar from './ControlBar';
import StatusBar from './StatusBar';
import SettingsModal from '../Settings/SettingsModal';
import LoadingScreen from './LoadingScreen';
import { useToast } from '../Toast';
import '../../styles/theme.css';
import './Layout.css';

export interface ConnectionStats {
    latency: number;
    bitrate: number;
    resolution: string;
    fps: number;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
}

const WS_URL = 'ws://localhost:3001/ws';

export default function MainLayout() {
    const [showSettings, setShowSettings] = useState(false);
    const [showLoading, setShowLoading] = useState(true);
    const [virtualCamActive, setVirtualCamActive] = useState(false);
    const [mirrorVideo, setMirrorVideo] = useState(false);
    const [connectionStats, setConnectionStats] = useState<ConnectionStats>({
        latency: 0,
        bitrate: 0,
        resolution: '-',
        fps: 0,
        status: 'disconnected',
    });
    const [connectedDevices, setConnectedDevices] = useState<
        { id: string; deviceName: string; platform: string }[]
    >([]);

    const videoRef = useRef<HTMLVideoElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const previewPcRef = useRef<RTCPeerConnection | null>(null);
    const statsIntervalRef = useRef<number | null>(null);
    const prevBytesRef = useRef<{ bytes: number; ts: number } | null>(null);
    // Keep connectedDevices accessible in stale closures
    const connectedDevicesRef = useRef(connectedDevices);
    connectedDevicesRef.current = connectedDevices;

    const toast = useToast();
    // Use a ref so ws.onmessage always calls the latest toast.show without
    // having to list `toast` as a useCallback dep (which would cause reconnects).
    const toastShowRef = useRef(toast.show);
    toastShowRef.current = toast.show;

    // ── Loading screen ──────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setShowLoading(false), 1000);
        return () => clearTimeout(t);
    }, []);

    // ── Mirror preference from settings ────────────────────────────────────
    useEffect(() => {
        try {
            const saved = localStorage.getItem('opticlink-settings');
            if (saved) {
                const s = JSON.parse(saved);
                if (s.video?.mirror !== undefined) setMirrorVideo(s.video.mirror);
            }
        } catch {}
    }, []);

    // ── Virtual cam status polling ──────────────────────────────────────────
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const statusStr = await invoke<string>('get_virtual_cam_status');
                const status = JSON.parse(statusStr);
                setVirtualCamActive(status.active);
            } catch {}
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // ── Stats polling via RTCPeerConnection ────────────────────────────────
    const startStatsPolling = useCallback((pc: RTCPeerConnection) => {
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        prevBytesRef.current = null;

        statsIntervalRef.current = window.setInterval(async () => {
            try {
                const stats = await pc.getStats();
                stats.forEach((report) => {
                    if (report.type === 'inbound-rtp' && report.kind === 'video') {
                        const resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;
                        const fps = Math.round(report.framesPerSecond || 0);

                        const nowBytes: number = report.bytesReceived ?? 0;
                        const nowTs = Date.now();
                        let bitrate = 0;
                        if (prevBytesRef.current) {
                            const deltaBits = (nowBytes - prevBytesRef.current.bytes) * 8;
                            const deltaSec = (nowTs - prevBytesRef.current.ts) / 1000;
                            if (deltaSec > 0) bitrate = Math.round(deltaBits / 1000 / deltaSec);
                        }
                        prevBytesRef.current = { bytes: nowBytes, ts: nowTs };

                        setConnectionStats(prev => ({ ...prev, resolution, fps, bitrate }));
                    }
                    if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                        const rtt = report.currentRoundTripTime;
                        if (rtt != null) {
                            setConnectionStats(prev => ({
                                ...prev,
                                latency: Math.round(rtt * 1000),
                            }));
                        }
                    }
                });
            } catch {}
        }, 1000);
    }, []);

    const stopPreview = useCallback(() => {
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        if (previewPcRef.current) {
            previewPcRef.current.close();
            previewPcRef.current = null;
        }
        setConnectionStats(prev => ({
            ...prev,
            status: connectedDevicesRef.current.length > 0 ? 'connected' : 'disconnected',
        }));
    }, []);

    // ── WebSocket + preview WebRTC ──────────────────────────────────────────
    const connectWebSocket = useCallback(() => {
        setConnectionStats(prev => ({ ...prev, status: 'connecting' }));

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnectionStats(prev => ({ ...prev, status: 'connected' }));
        };

        ws.onclose = () => {
            setConnectionStats(prev => ({
                ...prev,
                status: prev.status === 'live' ? 'live' : 'disconnected',
            }));
            setTimeout(() => {
                if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
                    connectWebSocket();
                }
            }, 3000);
        };

        ws.onerror = () => {
            setConnectionStats(prev => ({ ...prev, status: 'disconnected' }));
        };

        ws.onmessage = async (event) => {
            let msg: any;
            try {
                msg = JSON.parse(event.data as string);
            } catch {
                return;
            }

            // ── Phone connected ────────────────────────────────────────────
            if (msg.type === 'phone-hello') {
                const id = (msg.deviceName || 'device') + (msg.platform || '');
                setConnectedDevices(prev => {
                    if (prev.some(d => d.id === id)) return prev;
                        toastShowRef.current(`${msg.deviceName || 'Phone'} connected`, 'success');
                    return [
                        ...prev,
                        {
                            id,
                            deviceName: msg.deviceName || 'Mobile Device',
                            platform: msg.platform || '',
                        },
                    ];
                });
                setConnectionStats(prev => ({
                    ...prev,
                    status: prev.status === 'live' ? 'live' : 'connected',
                }));

                // Auto-start virtual cam when phone connects (if setting enabled)
                try {
                    const saved = localStorage.getItem('opticlink-settings');
                    if (saved) {
                        const s = JSON.parse(saved);
                        if (s.virtualCam?.autoStart) {
                            invoke('start_virtual_cam').catch(() => {});
                            setVirtualCamActive(true);
                        }
                    }
                } catch {}

            // ── Phone disconnected ────────────────────────────────────────
            } else if (msg.type === 'client-disconnect') {
                setConnectedDevices(prev => prev.filter(d => d.id !== msg.clientId));
                toastShowRef.current('Phone disconnected', 'info');

            // ── Preview offer from phone ──────────────────────────────────
            } else if (msg.type === 'preview-offer') {
                try {
                    // Close any existing preview PC
                    if (previewPcRef.current) {
                        previewPcRef.current.close();
                        previewPcRef.current = null;
                    }
                    if (statsIntervalRef.current) {
                        clearInterval(statsIntervalRef.current);
                        statsIntervalRef.current = null;
                    }

                    const pc = new RTCPeerConnection({
                        iceServers: [
                            { urls: 'stun:stun.l.google.com:19302' },
                            { urls: 'stun:stun1.l.google.com:19302' },
                        ],
                    });
                    previewPcRef.current = pc;

                    pc.ontrack = (trackEvent) => {
                        if (videoRef.current && trackEvent.streams[0]) {
                            videoRef.current.srcObject = trackEvent.streams[0];
                            videoRef.current.muted = true;
                            setConnectionStats(prev => ({ ...prev, status: 'live' }));
                            startStatsPolling(pc);
                        }
                    };

                    pc.onicecandidate = (iceEvent) => {
                        if (iceEvent.candidate) {
                            ws.send(JSON.stringify({
                                type: 'preview-ice-candidate',
                                candidate: iceEvent.candidate.candidate,
                                sdp_mid: iceEvent.candidate.sdpMid,
                                sdp_m_line_index: iceEvent.candidate.sdpMLineIndex,
                            }));
                        }
                    };

                    pc.onconnectionstatechange = () => {
                        if (
                            pc.connectionState === 'disconnected' ||
                            pc.connectionState === 'failed'
                        ) {
                            if (videoRef.current) videoRef.current.srcObject = null;
                            setConnectionStats(prev => ({
                                ...prev,
                                status: prev.status === 'live' ? 'connected' : prev.status,
                            }));
                            if (statsIntervalRef.current) {
                                clearInterval(statsIntervalRef.current);
                                statsIntervalRef.current = null;
                            }
                        }
                    };

                    await pc.setRemoteDescription(
                        new RTCSessionDescription({ type: 'offer', sdp: msg.sdp })
                    );
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);

                    ws.send(JSON.stringify({
                        type: 'preview-answer',
                        sdp: answer.sdp,
                    }));
                } catch (e) {
                    console.error('[Preview] WebRTC error:', e);
                }

            // ── Preview ICE candidate from phone ──────────────────────────
            } else if (msg.type === 'preview-ice-candidate') {
                if (previewPcRef.current) {
                    try {
                        await previewPcRef.current.addIceCandidate(new RTCIceCandidate({
                            candidate: msg.candidate,
                            sdpMid: msg.sdp_mid,
                            sdpMLineIndex: msg.sdp_m_line_index,
                        }));
                    } catch {}
                }
            }
        };
    }, [startStatsPolling]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
            previewPcRef.current?.close();
            wsRef.current?.close();
        };
    }, [connectWebSocket]);

    // ── Virtual camera toggle (separate from preview) ─────────────────────
    const toggleVirtualCam = async () => {
        try {
            if (virtualCamActive) {
                await invoke('stop_virtual_cam');
                setVirtualCamActive(false);
                toast.show('Virtual Camera stopped', 'info');
            } else {
                await invoke('start_virtual_cam');
                setVirtualCamActive(true);
                toast.show('Virtual Camera started', 'success');
            }
        } catch (e) {
            console.error('[VCam] Toggle error:', e);
            toast.show('Virtual Camera not available on this system', 'error');
        }
    };

    return (
        <div className="main-layout">
            <div className="layout-content">
                <Sidebar
                    status={connectionStats.status}
                    connectedDevices={connectedDevices}
                />
                <PreviewPanel
                    videoRef={videoRef}
                    status={connectionStats.status}
                    stats={connectionStats}
                    mirror={mirrorVideo}
                    startStatsPolling={startStatsPolling}
                />
            </div>
            <ControlBar
                virtualCamActive={virtualCamActive}
                onToggleVirtualCam={toggleVirtualCam}
                onOpenSettings={() => setShowSettings(true)}
                status={connectionStats.status}
                connectedCount={connectedDevices.length}
            />
            <StatusBar stats={connectionStats} />

            {showSettings && (
                <SettingsModal
                    onClose={() => setShowSettings(false)}
                    onMirrorChange={setMirrorVideo}
                />
            )}
            <LoadingScreen visible={showLoading} onDismiss={() => setShowLoading(false)} />
        </div>
    );
}
