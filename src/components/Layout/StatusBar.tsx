interface ConnectionStats {
    latency: number;
    bitrate: number;
    resolution: string;
    fps: number;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
}

interface StatusBarProps {
    stats: ConnectionStats;
}

export default function StatusBar({ stats }: StatusBarProps) {
    const getStatusText = () => {
        switch (stats.status) {
            case 'live': return 'Streaming';
            case 'connected': return 'Connected (waiting for video)';
            case 'connecting': return 'Connecting...';
            default: return 'Disconnected';
        }
    };

    return (
        <div className="status-bar">
            <div className="status-group">
                <div className="status-item">
                    <span className={`status-dot ${stats.status}`}></span>
                    <span>{getStatusText()}</span>
                </div>

                {stats.status === 'live' && (
                    <>
                        <div className="status-item">
                            <span>Resolution:</span>
                            <span style={{ color: 'var(--text-primary)' }}>{stats.resolution}</span>
                        </div>
                        <div className="status-item">
                            <span>FPS:</span>
                            <span style={{ color: 'var(--text-primary)' }}>{stats.fps}</span>
                        </div>
                        <div className="status-item">
                            <span>Bitrate:</span>
                            <span style={{ color: 'var(--text-primary)' }}>{Math.round(stats.bitrate)} kbps</span>
                        </div>
                        <div className="status-item">
                            <span>Latency:</span>
                            <span style={{ color: stats.latency < 100 ? 'var(--accent-success)' : stats.latency < 200 ? 'var(--accent-warning)' : 'var(--accent-error)' }}>
                                {stats.latency}ms
                            </span>
                        </div>
                    </>
                )}
            </div>

            <div className="status-group">
                <span>OpticLink v0.1.0</span>
            </div>
        </div>
    );
}
