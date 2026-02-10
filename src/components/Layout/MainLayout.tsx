import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import Sidebar from './Sidebar';
import PreviewPanel from './PreviewPanel';
import ControlBar from './ControlBar';
import StatusBar from './StatusBar';
import SettingsModal from '../Settings/SettingsModal';
import '../../styles/theme.css';
import './Layout.css';

interface ConnectionStats {
    latency: number;
    bitrate: number;
    resolution: string;
    fps: number;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
}

export default function MainLayout() {
    const [showSettings, setShowSettings] = useState(false);
    const [virtualCamActive, setVirtualCamActive] = useState(false);
    const [connectionStats, setConnectionStats] = useState<ConnectionStats>({
        latency: 0,
        bitrate: 0,
        resolution: '-',
        fps: 0,
        status: 'disconnected'
    });

    const videoRef = useRef<HTMLVideoElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);
    const statsIntervalRef = useRef<number | null>(null);

    useEffect(() => {
        connectWebSocket();
        return () => {
            cleanup();
        };
    }, []);

    const connectWebSocket = () => {
        setConnectionStats(prev => ({ ...prev, status: 'connecting' }));

        const ws = new WebSocket('ws://localhost:3001/ws');
        wsRef.current = ws;

        ws.onopen = () => {
            setConnectionStats(prev => ({ ...prev, status: 'connected' }));
        };

        ws.onclose = () => {
            setConnectionStats(prev => ({ ...prev, status: 'disconnected' }));
            // Auto-reconnect after 3 seconds
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
            const msg = JSON.parse(event.data);

            // Backend handles WebRTC now. Frontend just monitors.
            // if (msg.type === 'offer') {
            //    await handleOffer(msg, ws);
            // }
            console.log("WS Message:", msg.type);
        };
    };

    const handleOffer = async (msg: any, ws: WebSocket) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });
        pcRef.current = pc;

        pc.ontrack = (event) => {
            if (videoRef.current) {
                videoRef.current.srcObject = event.streams[0];
                setConnectionStats(prev => ({ ...prev, status: 'live' }));
                startStatsPolling(pc);
            }
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'ice-candidate',
                    candidate: event.candidate.candidate,
                    sdp_mid: event.candidate.sdpMid,
                    sdp_m_line_index: event.candidate.sdpMLineIndex,
                    target: 'phone'
                }));
            }
        };

        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: msg.sdp
        }));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(JSON.stringify({
            type: 'answer',
            sdp: answer.sdp,
            target: 'phone'
        }));
    };

    const startStatsPolling = (pc: RTCPeerConnection) => {
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);

        statsIntervalRef.current = window.setInterval(async () => {
            const stats = await pc.getStats();
            stats.forEach((report) => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    const resolution = `${report.frameWidth || 0}x${report.frameHeight || 0}`;
                    const fps = report.framesPerSecond || 0;
                    const bitrate = Math.round((report.bytesReceived * 8) / 1000); // kbps

                    setConnectionStats(prev => ({
                        ...prev,
                        resolution,
                        fps: Math.round(fps),
                        bitrate
                    }));
                }
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    setConnectionStats(prev => ({
                        ...prev,
                        latency: Math.round(report.currentRoundTripTime * 1000) || prev.latency
                    }));
                }
            });
        }, 1000);
    };

    const cleanup = () => {
        if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
        if (wsRef.current) wsRef.current.close();
        if (pcRef.current) pcRef.current.close();
    };

    const startPreview = async () => {
        try {
            // Give the VCam a moment to register if just started
            await new Promise(r => setTimeout(r, 1000));

            const devices = await navigator.mediaDevices.enumerateDevices();
            const vcam = devices.find(d => d.label.includes("OpticLink"));

            if (vcam) {
                console.log("Found VCam:", vcam.label);
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: { exact: vcam.deviceId } }
                });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Mute local playback to prevent audio loop if any (video only anyway)
                    videoRef.current.muted = true;
                }
            } else {
                console.warn("OpticLink Virtual Camera not found in devices");
            }
        } catch (e) {
            console.error("Preview error:", e);
        }
    };

    const stopPreview = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
    };

    const toggleVirtualCam = async () => {
        try {
            if (virtualCamActive) {
                await invoke('stop_virtual_cam');
                setVirtualCamActive(false);
                stopPreview();
            } else {
                await invoke('start_virtual_cam');
                setVirtualCamActive(true);
                startPreview(); // Start loopback preview
            }
        } catch (e) {
            console.error("Failed to toggle camera:", e);
        }
    };


    // Poll backend status
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const statusStr = await invoke<string>('get_virtual_cam_status');
                const status = JSON.parse(statusStr);
                setVirtualCamActive(status.active);
                // Update connection stats based on backend?
                if (status.active) {
                    setConnectionStats(prev => ({ ...prev, status: 'live' }));
                }
            } catch (e) {
                // console.error(e);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="main-layout">
            <div className="layout-content">
                <Sidebar
                    status={connectionStats.status}
                />
                <PreviewPanel
                    videoRef={videoRef}
                    status={connectionStats.status}
                    stats={connectionStats}
                />
            </div>
            <ControlBar
                virtualCamActive={virtualCamActive}
                onToggleVirtualCam={toggleVirtualCam}
                onOpenSettings={() => setShowSettings(true)}
                status={connectionStats.status}
            />
            <StatusBar stats={connectionStats} />

            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
            )}
        </div>
    );
}
