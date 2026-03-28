import { IconCamera, IconCameraOff, IconSettings, IconMirror, IconVolume } from '../Icons';

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
    connectedCount = 0,
}: ControlBarProps) {
    // Virtual cam can always be toggled — user should start it before the phone streams
    const isLive = status === 'live';

    return (
        <div className="control-bar">
            <div className="control-group">
                <button
                    className={`btn ${virtualCamActive ? 'btn-danger' : 'btn-primary'}`}
                    onClick={onToggleVirtualCam}
                    title={virtualCamActive ? 'Stop Virtual Camera' : 'Start Virtual Camera'}
                >
                    {virtualCamActive
                        ? <><IconCameraOff size={15} /> Stop Virtual Cam</>
                        : <><IconCamera size={15} /> Start Virtual Cam</>
                    }
                </button>

                <div className="control-divider" />

                <button
                    className="btn btn-icon"
                    disabled
                    title="Mirror Video (coming soon)"
                >
                    <IconMirror size={15} />
                </button>

                <button
                    className="btn btn-icon"
                    disabled
                    title="Audio (coming soon)"
                >
                    <IconVolume size={15} />
                </button>
            </div>

            <div className="control-group">
                <span className="vcam-status-label">
                    {virtualCamActive && <span className="status-dot connected" />}
                    {virtualCamActive
                        ? 'Virtual Camera Active'
                        : connectedCount > 0
                            ? 'Start Virtual Cam before streaming'
                            : 'Virtual Camera Off'}
                </span>

                <div className="control-divider" />

                <button
                    className="btn btn-icon"
                    onClick={onOpenSettings}
                    title="Settings"
                >
                    <IconSettings size={15} />
                </button>
            </div>
        </div>
    );
}
