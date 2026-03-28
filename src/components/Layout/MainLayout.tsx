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
    const statsIntervalRef = useRef<number | null>(null);
    // Track previous bytesReceived for delta-based bitrate
    const prevBytesRef = useRef<{ bytes: number; ts: number } | null>(null);

    const toast = useToast();

    // ── Loading screen: dismiss after 1 s ──────────────────────────────────
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

    // ── WebSocket ───────────────────────────────────────────────────────────
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

        ws.onmessage = (event) => {
            let msg: any;
            try {
                msg = JSON.parse(event.data as string);
            } catch {
                return;
            }

            if (msg.type === 'phone-hello') {
                const id = (msg.deviceName || 'device') + (msg.platform || '');
                setConnectedDevices(prev => {
                    if (prev.some(d => d.id === id)) return prev;
                    const newList = [
                        ...prev,
                        {
                            id,
                            deviceName: msg.deviceName || 'Mobile Device',
                            platform: msg.platform || '',
                        },
                    ];
                    return newList;
                });
                setConnectionStats(prev => ({
                    ...prev,
                    status: prev.status === 'live' ? 'live' : 'connected',
                }));
                toast.show(`${msg.deviceName || 'Phone'} connected`, 'success');

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
            } else if (msg.type === 'client-disconnect') {
                setConnectedDevices(prev => prev.filter(d => d.id !== msg.clientId));
                toast.show('Phone disconnected', 'info');
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
            wsRef.current?.close();
        };
    }, [connectWebSocket]);

    // ── Stats polling ───────────────────────────────────────────────────────
    const startStatsPolling = (pc: RTCPeerConnection) => {
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        prevBytesRef.current = null;

        statsIntervalRef.current = window.setInterval(async () => {
            const stats = await pc.getStats();
            stats.forEach((report) => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    const resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;
                    const fps = Math.round(report.framesPerSecond || 0);

                    // Delta-based bitrate (kbps)
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
        }, 1000);
    };

    // ── Virtual camera loopback preview ────────────────────────────────────
    const startPreview = async () => {
        try {
            await new Promise(r => setTimeout(r, 1200));
            const devices = await navigator.mediaDevices.enumerateDevices();
            const vcam = devices.find(d => d.label.toLowerCase().includes('opticlink'));
            if (vcam) {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: vcam.deviceId } },
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.muted = true;
                    setConnectionStats(prev => ({ ...prev, status: 'live' }));
                    // Fake stats polling on the MediaStream track
                    const [track] = stream.getVideoTracks();
                    const pollStats = () => {
                        const settings = track.getSettings();
                        if (settings.width && settings.height) {
                            setConnectionStats(prev => ({
                                ...prev,
                                resolution: `${settings.width}x${settings.height}`,
                                fps: settings.frameRate ? Math.round(settings.frameRate) : prev.fps,
                            }));
                        }
                    };
                    pollStats();
                    statsIntervalRef.current = window.setInterval(pollStats, 2000);
                }
            } else {
                console.warn('[Preview] OpticLink Virtual Camera not found');
            }
        } catch (e) {
            console.error('[Preview] Error:', e);
        }
    };

    const stopPreview = () => {
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        setConnectionStats(prev => ({
            ...prev,
            status: connectedDevices.length > 0 ? 'connected' : 'disconnected',
        }));
    };

    const toggleVirtualCam = async () => {
        try {
            if (virtualCamActive) {
                await invoke('stop_virtual_cam');
                setVirtualCamActive(false);
                stopPreview();
                toast.show('Virtual Camera stopped', 'info');
            } else {
                await invoke('start_virtual_cam');
                setVirtualCamActive(true);
                toast.show('Virtual Camera started', 'success');
                startPreview();
            }
        } catch (e) {
            console.error('[VCam] Toggle error:', e);
            toast.show('Failed to toggle Virtual Camera', 'error');
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
