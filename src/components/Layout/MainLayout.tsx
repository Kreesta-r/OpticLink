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

    // MSE (Media Source Extensions) refs for WebSocket-relay preview
    const msRef = useRef<MediaSource | null>(null);
    const sbRef = useRef<SourceBuffer | null>(null);
    const pendingChunksRef = useRef<ArrayBuffer[]>([]);
    const chunkBytesRef = useRef<number>(0);  // bytes received this second (for bitrate)

    // Keep connectedDevices accessible in stale closures
    const connectedDevicesRef = useRef(connectedDevices);
    connectedDevicesRef.current = connectedDevices;

    const toast = useToast();
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

    // ── Drain MSE queue ─────────────────────────────────────────────────────
    const drainMSE = useCallback(() => {
        const sb = sbRef.current;
        if (!sb || sb.updating || pendingChunksRef.current.length === 0) return;
        try {
            sb.appendBuffer(pendingChunksRef.current.shift()!);
        } catch (e: any) {
            if (e?.name === 'QuotaExceededError') {
                // Remove oldest ~10s of buffered data to make room
                if (sb.buffered.length > 0) {
                    try { sb.remove(sb.buffered.start(0), sb.buffered.start(0) + 10); } catch {}
                }
            } else {
                pendingChunksRef.current = []; // clear on other errors
            }
        }
    }, []);

    // ── Append a binary chunk to MSE ────────────────────────────────────────
    const appendChunk = useCallback((buffer: ArrayBuffer) => {
        chunkBytesRef.current += buffer.byteLength;
        pendingChunksRef.current.push(buffer);

        // Cap queue to ~30 chunks to prevent unbounded memory growth
        while (pendingChunksRef.current.length > 30) pendingChunksRef.current.shift();

        drainMSE();
    }, [drainMSE]);

    // ── Start MSE-based preview ─────────────────────────────────────────────
    const initPreviewMSE = useCallback((mimeType: string) => {
        // Clean up any existing MSE session
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        sbRef.current = null;
        pendingChunksRef.current = [];
        chunkBytesRef.current = 0;

        if (!('MediaSource' in window)) {
            console.warn('[Preview] MediaSource not supported');
            return;
        }
        if (!MediaSource.isTypeSupported(mimeType)) {
            console.warn('[Preview] Unsupported MIME type:', mimeType);
            // Try a fallback
            const fallback = 'video/webm; codecs=vp8';
            if (mimeType !== fallback && MediaSource.isTypeSupported(fallback)) {
                initPreviewMSE(fallback);
            }
            return;
        }

        const ms = new MediaSource();
        msRef.current = ms;
        const url = URL.createObjectURL(ms);

        ms.addEventListener('sourceopen', () => {
            try {
                const sb = ms.addSourceBuffer(mimeType);
                sbRef.current = sb;
                sb.addEventListener('updateend', drainMSE);
                // Flush anything already queued
                drainMSE();
            } catch (e) {
                console.error('[MSE] addSourceBuffer error:', e);
            }
        }, { once: true });

        if (videoRef.current) {
            videoRef.current.src = url;
            videoRef.current.play().catch(() => {});
        }

        setConnectionStats(prev => ({ ...prev, status: 'live' }));

        // Stats + seek-to-live + buffer trimming
        let lastFrames = 0;
        statsIntervalRef.current = window.setInterval(() => {
            const v = videoRef.current;
            const sb = sbRef.current;
            if (!v) return;

            // ── Seek to live edge if we're falling behind ───────────────
            if (sb && sb.buffered.length > 0) {
                const bufEnd = sb.buffered.end(sb.buffered.length - 1);
                const bufStart = sb.buffered.start(0);
                // If video is >1.5s behind buffer end, jump to near-live
                if (bufEnd - v.currentTime > 1.5) {
                    v.currentTime = bufEnd - 0.2;
                }
                // Trim buffer older than 8s to prevent QuotaExceededError
                if (!sb.updating && bufEnd - bufStart > 8) {
                    try { sb.remove(bufStart, bufEnd - 6); } catch {}
                }
            }

            // ── Stats ────────────────────────────────────────────────────
            const w = v.videoWidth;
            const h = v.videoHeight;
            const quality = (v as any).getVideoPlaybackQuality?.();
            const totalFrames = quality?.totalVideoFrames ?? 0;
            const fps = Math.max(0, totalFrames - lastFrames);
            lastFrames = totalFrames;

            const bytes = chunkBytesRef.current;
            chunkBytesRef.current = 0;

            setConnectionStats(prev => ({
                ...prev,
                ...(w && h ? { resolution: `${w}x${h}`, fps } : {}),
                bitrate: Math.round(bytes * 8 / 1000),
                latency: 0,
            }));
        }, 1000);
    }, [drainMSE]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Stop preview ────────────────────────────────────────────────────────
    const stopPreview = useCallback(() => {
        if (statsIntervalRef.current) {
            clearInterval(statsIntervalRef.current);
            statsIntervalRef.current = null;
        }
        sbRef.current = null;
        msRef.current = null;
        pendingChunksRef.current = [];

        if (videoRef.current) {
            videoRef.current.src = '';
            videoRef.current.srcObject = null;
        }

        setConnectionStats(prev => ({
            ...prev,
            status: connectedDevicesRef.current.length > 0 ? 'connected' : 'disconnected',
            fps: 0,
            bitrate: 0,
            resolution: '-',
            latency: 0,
        }));
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── WebSocket signaling ─────────────────────────────────────────────────
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
            // ── Binary message = video preview chunk ──────────────────────
            if (event.data instanceof Blob) {
                const buffer = await event.data.arrayBuffer();
                appendChunk(buffer);
                return;
            }

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
                stopPreview();

            // ── Preview stream starting ───────────────────────────────────
            } else if (msg.type === 'preview-start') {
                const mimeType: string = msg.mimeType || 'video/webm; codecs=vp8';
                initPreviewMSE(mimeType);

            // ── Preview stream stopping ───────────────────────────────────
            } else if (msg.type === 'preview-stop') {
                stopPreview();
            }
        };
    }, [appendChunk, initPreviewMSE, stopPreview]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        connectWebSocket();
        return () => {
            if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
            wsRef.current?.close();
        };
    }, [connectWebSocket]);

    // ── Virtual camera toggle ─────────────────────────────────────────────
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
            const errStr = String(e);
            let msg: string;
            if (errStr.includes('22000') || errStr.includes('Windows 11') || errStr.includes('REGDB') || errStr.includes('80040154')) {
                msg = 'Virtual Camera requires Windows 11 build 22000+';
            } else if (errStr.includes('not supported') || errStr.includes('C00D36D5')) {
                msg = 'Virtual Camera is not supported on this system';
            } else if (errStr.includes('COM') || errStr.includes('registered')) {
                msg = 'Virtual Camera needs COM server setup — see the docs';
            } else {
                msg = `Virtual Camera error — ${errStr.slice(0, 60)}`;
            }
            toast.show(msg, 'error');
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
