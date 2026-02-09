interface ControlBarProps {
    virtualCamActive: boolean;
    onToggleVirtualCam: () => void;
    onOpenSettings: () => void;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
}

export default function ControlBar({
    virtualCamActive,
    onToggleVirtualCam,
    onOpenSettings,
    status
}: ControlBarProps) {
    const isLive = status === 'live';

    return (
        <div className="control-bar">
            <div className="control-group">
                <button
                    className={`btn ${virtualCamActive ? 'btn-danger' : 'btn-primary'}`}
                    onClick={onToggleVirtualCam}
                    disabled={!isLive}
                    title={virtualCamActive ? 'Stop Virtual Camera' : 'Start Virtual Camera'}
                >
                    <span>📷</span>
                    {virtualCamActive ? 'Stop Virtual Cam' : 'Start Virtual Cam'}
                </button>

                <div className="control-divider" />

                <button
                    className="btn"
                    disabled={!isLive}
                    title="Mute Audio"
                >
                    🔊
                </button>

                <button
                    className="btn"
                    disabled={!isLive}
                    title="Mirror Video"
                >
                    ↔️
                </button>
            </div>

            <div className="control-group">
                <span style={{
                    fontSize: 12,
                    color: virtualCamActive ? 'var(--accent-success)' : 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                }}>
                    {virtualCamActive && <span className="status-dot connected" />}
                    {virtualCamActive ? 'Virtual Camera Active' : 'Virtual Camera Off'}
                </span>

                <div className="control-divider" />

                <button
                    className="btn btn-icon"
                    onClick={onOpenSettings}
                    title="Settings"
                >
                    ⚙️
                </button>
            </div>
        </div>
    );
}
