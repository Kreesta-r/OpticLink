import { useState, useEffect } from 'react';
import { IconClose } from '../Icons';
import './Settings.css';

interface SettingsModalProps {
    onClose: () => void;
    onMirrorChange?: (mirror: boolean) => void;
}

type SettingsTab = 'video' | 'connection' | 'virtualcam' | 'advanced';

interface AppSettings {
    video: {
        mirror: boolean;
        showStats: boolean;
    };
    connection: {
        autoReconnect: boolean;
        reconnectDelay: number;
    };
    virtualCam: {
        autoStart: boolean;
    };
    advanced: {
        debugMode: boolean;
    };
}

const STORAGE_KEY = 'opticlink-settings';

function loadSettings(): AppSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return { ...defaultSettings(), ...JSON.parse(raw) };
    } catch {}
    return defaultSettings();
}

function defaultSettings(): AppSettings {
    return {
        video: { mirror: false, showStats: true },
        connection: { autoReconnect: true, reconnectDelay: 3 },
        virtualCam: { autoStart: false },
        advanced: { debugMode: false },
    };
}

export default function SettingsModal({ onClose, onMirrorChange }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>('video');
    const [settings, setSettings] = useState<AppSettings>(loadSettings);
    const [saved, setSaved] = useState(false);

    const update = <T extends keyof AppSettings>(
        section: T,
        key: keyof AppSettings[T],
        value: any
    ) => {
        setSettings(prev => ({
            ...prev,
            [section]: { ...prev[section], [key]: value },
        }));
        setSaved(false);
    };

    const save = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        onMirrorChange?.(settings.video.mirror);
        setSaved(true);
        setTimeout(onClose, 600);
    };

    const tabs: { id: SettingsTab; label: string; icon: JSX.Element }[] = [
        {
            id: 'video', label: 'Video', icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 7l-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                </svg>
            )
        },
        {
            id: 'connection', label: 'Connection', icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
            )
        },
        {
            id: 'virtualcam', label: 'Virtual Camera', icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                </svg>
            )
        },
        {
            id: 'advanced', label: 'Advanced', icon: (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
            )
        },
    ];

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="btn btn-icon" onClick={onClose}>
                        <IconClose size={14} />
                    </button>
                </div>

                <div className="settings-content">
                    <div className="settings-sidebar">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="tab-icon">{tab.icon}</span>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="settings-panel">
                        {activeTab === 'video' && (
                            <div className="settings-section">
                                <h3>Video</h3>

                                <div className="form-group">
                                    <label className="form-label">Mirror Preview</label>
                                    <div
                                        className={`toggle ${settings.video.mirror ? 'active' : ''}`}
                                        onClick={() => update('video', 'mirror', !settings.video.mirror)}
                                    />
                                    <p className="form-hint">Flip the desktop preview horizontally</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Show Stats Overlay</label>
                                    <div
                                        className={`toggle ${settings.video.showStats ? 'active' : ''}`}
                                        onClick={() => update('video', 'showStats', !settings.video.showStats)}
                                    />
                                    <p className="form-hint">Display resolution, FPS, latency, and bitrate on the preview</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'connection' && (
                            <div className="settings-section">
                                <h3>Connection</h3>

                                <div className="form-group">
                                    <label className="form-label">Auto-Reconnect</label>
                                    <div
                                        className={`toggle ${settings.connection.autoReconnect ? 'active' : ''}`}
                                        onClick={() => update('connection', 'autoReconnect', !settings.connection.autoReconnect)}
                                    />
                                    <p className="form-hint">Automatically reconnect when the desktop WebSocket closes</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Reconnect Delay (seconds)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={settings.connection.reconnectDelay}
                                        min={1}
                                        max={30}
                                        onChange={e =>
                                            update('connection', 'reconnectDelay', parseInt(e.target.value) || 3)
                                        }
                                    />
                                </div>

                                <div className="form-group settings-info-box">
                                    <p><strong>Phone server</strong> runs on HTTPS port 3002.</p>
                                    <p><strong>Desktop signaling</strong> runs on HTTP port 3001 (loopback only).</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'virtualcam' && (
                            <div className="settings-section">
                                <h3>Virtual Camera</h3>

                                <div className="form-group">
                                    <label className="form-label">Auto-Start When Phone Connects</label>
                                    <div
                                        className={`toggle ${settings.virtualCam.autoStart ? 'active' : ''}`}
                                        onClick={() => update('virtualCam', 'autoStart', !settings.virtualCam.autoStart)}
                                    />
                                    <p className="form-hint">
                                        Automatically start the virtual camera when a phone connects.
                                        Recommended for hands-free operation.
                                    </p>
                                </div>

                                <div className="form-group settings-info-box">
                                    <p>The virtual camera appears as <strong>OpticLink Virtual Camera</strong> in Zoom, OBS, Teams, and other apps.</p>
                                    <p style={{ marginTop: 6 }}>Windows 11 required.</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'advanced' && (
                            <div className="settings-section">
                                <h3>Advanced</h3>

                                <div className="form-group">
                                    <label className="form-label">Debug Logging</label>
                                    <div
                                        className={`toggle ${settings.advanced.debugMode ? 'active' : ''}`}
                                        onClick={() => update('advanced', 'debugMode', !settings.advanced.debugMode)}
                                    />
                                    <p className="form-hint">Enable verbose console logging for troubleshooting</p>
                                </div>

                                <div className="form-group">
                                    <button
                                        className="btn btn-danger"
                                        style={{ width: 'fit-content' }}
                                        onClick={() => {
                                            localStorage.removeItem(STORAGE_KEY);
                                            setSettings(defaultSettings());
                                            setSaved(false);
                                        }}
                                    >
                                        Reset All Settings
                                    </button>
                                    <p className="form-hint" style={{ marginTop: 6 }}>Restores all settings to their defaults</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={save}>
                        {saved ? 'Saved!' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}
