import { RefObject } from 'react';

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
}

export default function PreviewPanel({ videoRef, status, stats }: PreviewPanelProps) {
    const isLive = status === 'live';

    return (
        <main className="preview-panel">
            <div className="panel-header">
                <span>Preview</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-icon" title="Fullscreen">⛶</button>
                </div>
            </div>

            <div className="preview-container">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="preview-video"
                />

                {/* Live indicator */}
                {isLive && (
                    <div className="live-badge">
                        <span className="status-dot live"></span>
                        LIVE
                    </div>
                )}

                {/* Stats overlay */}
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
                    </div>
                )}

                {/* Waiting overlay */}
                {!isLive && (
                    <div className="preview-overlay">
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.5 }}>📹</div>
                            <h2 style={{ fontSize: 18, marginBottom: 8, color: 'var(--text-primary)' }}>
                                {status === 'connecting' ? 'Connecting...' :
                                    status === 'connected' ? 'Waiting for video...' :
                                        'No Source Connected'}
                            </h2>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                {status === 'disconnected'
                                    ? 'Scan the QR code with your phone to start streaming'
                                    : 'Phone connected, waiting for camera access'}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}
