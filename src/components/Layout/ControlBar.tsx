interface ControlBarProps {
    virtualCamActive: boolean;
    onToggleVirtualCam: () => void;
    onOpenSettings: () => void;
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
    connectedCount?: number;
}

export default function ControlBar({
    virtualCamActive,
    onToggleVirtualCam,
    onOpenSettings,
    status,
    connectedCount = 0
}: ControlBarProps) {
    const canUseVirtualCam = status === 'connected' || status === 'live';

    return (
        <div className="control-bar">
            <div className="control-group">
                <button
                    className={`btn ${virtualCamActive ? 'btn-danger' : 'btn-primary'}`}
                    onClick={onToggleVirtualCam}
                    disabled={!canUseVirtualCam}
                    title={virtualCamActive ? 'Stop Virtual Camera' : 'Start Virtual Camera (do this before streaming)'}
                >
                    <span>📷</span>
                    {virtualCamActive ? 'Stop Virtual Cam' : 'Start Virtual Cam'}
                </button>

                <div className="control-divider" />

                <button
                    className="btn"
                    disabled={!canUseVirtualCam}
                    title="Mute Audio"
                >
                    🔊
                </button>

                <button
                    className="btn"
                    disabled={!canUseVirtualCam}
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
                    {virtualCamActive ? 'Virtual Camera Active' : connectedCount > 0 ? 'Turn on before phone streams' : 'Virtual Camera Off'}
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
