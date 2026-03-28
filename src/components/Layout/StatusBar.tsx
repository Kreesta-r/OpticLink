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

const VERSION = 'v0.2.0';

export default function StatusBar({ stats }: StatusBarProps) {
    const getStatusText = () => {
        switch (stats.status) {
            case 'live': return 'Streaming';
            case 'connected': return 'Device connected — waiting for stream';
            case 'connecting': return 'Connecting...';
            default: return 'Disconnected';
        }
    };

    return (
        <div className="status-bar">
            <div className="status-group">
                <div className="status-item">
                    <span className={`status-dot ${stats.status}`} />
                    <span>{getStatusText()}</span>
                </div>

                {stats.status === 'live' && (
                    <>
                        <div className="status-item">
                            <span>Resolution:</span>
                            <span className="status-value">{stats.resolution}</span>
                        </div>
                        <div className="status-item">
                            <span>FPS:</span>
                            <span className="status-value">{stats.fps}</span>
                        </div>
                        <div className="status-item">
                            <span>Bitrate:</span>
                            <span className="status-value">{stats.bitrate} kbps</span>
                        </div>
                        <div className="status-item">
                            <span>Latency:</span>
                            <span
                                className="status-value"
                                style={{
                                    color: stats.latency < 100
                                        ? 'var(--accent-success)'
                                        : stats.latency < 200
                                            ? 'var(--accent-warning)'
                                            : 'var(--accent-error)',
                                }}
                            >
                                {stats.latency}ms
                            </span>
                        </div>
                    </>
                )}
            </div>

            <div className="status-group">
                <span>OpticLink {VERSION}</span>
            </div>
        </div>
    );
}
