import { useState, useEffect, useRef } from 'react';
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

            if (msg.type === 'offer') {
                await handleOffer(msg, ws);
            } else if (msg.type === 'ice-candidate' && pcRef.current) {
                await pcRef.current.addIceCandidate(new RTCIceCandidate({
                    candidate: msg.candidate,
                    sdpMid: msg.sdp_mid,
                    sdpMLineIndex: msg.sdp_m_line_index
                }));
            }
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

    const toggleVirtualCam = async () => {
        // TODO: Invoke Tauri command
        setVirtualCamActive(!virtualCamActive);
    };

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
