import { RefObject } from 'react';
import { IconFullscreen } from '../Icons';

interface ConnectionStats {
    latency: number;
    bitrate: number;
    resolution: string;
    fps: number;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
}

interface PreviewPanelProps {
    videoRef: RefObject<HTMLVideoElement>;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
    stats: ConnectionStats;
    mirror?: boolean;
    startStatsPolling?: (pc: RTCPeerConnection) => void;
}

export default function PreviewPanel({ videoRef, status, stats, mirror = false }: PreviewPanelProps) {
    const isLive = status === 'live';

    const requestFullscreen = () => {
        const el = videoRef.current;
        if (el && document.fullscreenEnabled) {
            el.requestFullscreen?.().catch(() => {});
        }
    };

    return (
        <main className="preview-panel">
            <div className="panel-header">
                <span>Preview</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-icon" title="Fullscreen" onClick={requestFullscreen}>
                        <IconFullscreen size={13} />
                    </button>
                </div>
            </div>

            <div className="preview-container">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="preview-video"
                    style={mirror ? { transform: 'scaleX(-1)' } : undefined}
                />

                {isLive && (
                    <div className="live-badge">
                        <span className="status-dot live" />
                        LIVE
                    </div>
                )}

                {isLive && (
                    <div className="preview-stats">
                        <div className="stat-item">
                            <span className="stat-label">RES</span>
                            <span className="stat-value">{stats.resolution}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">FPS</span>
                            <span className="stat-value">{stats.fps}</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">LATENCY</span>
                            <span className="stat-value">{stats.latency}ms</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-label">BITRATE</span>
                            <span className="stat-value">{stats.bitrate} kbps</span>
                        </div>
                    </div>
                )}

                {!isLive && (
                    <div className="preview-overlay">
                        <div style={{ textAlign: 'center' }}>
                            <div className="preview-icon-wrap">
                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
                                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                    <circle cx="12" cy="13" r="4" />
                                </svg>
                            </div>
                            <h2 className="preview-title">
                                {status === 'connecting'
                                    ? 'Connecting...'
                                    : status === 'connected'
                                        ? 'Device Connected'
                                        : 'No Source Connected'}
                            </h2>
                            <p className="preview-subtitle">
                                {status === 'disconnected'
                                    ? 'Scan the QR code with your phone to get started'
                                    : status === 'connected'
                                        ? 'Click Start Virtual Cam, then tap Start Streaming on your phone'
                                        : 'Waiting for stream...'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
