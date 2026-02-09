import { useState } from 'react';
import './Settings.css';

interface SettingsModalProps {
    onClose: () => void;
}

type SettingsTab = 'video' | 'connection' | 'virtualcam' | 'advanced';

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const [activeTab, setActiveTab] = useState<SettingsTab>('video');

    // Settings state
    const [settings, setSettings] = useState({
        video: {
            resolution: '1080p',
            fps: '30',
            quality: 'high',
            mirror: false,
        },
        connection: {
            port: 3000,
            wsPort: 3001,
            autoReconnect: true,
            reconnectDelay: 3,
        },
        virtualCam: {
            deviceName: 'OpticLink Virtual Camera',
            autoStart: false,
        },
        advanced: {
            showStats: true,
            debugMode: false,
            lowLatencyMode: false,
        }
    });

    const updateSetting = <T extends keyof typeof settings>(
        category: T,
        key: keyof typeof settings[T],
        value: any
    ) => {
        setSettings(prev => ({
            ...prev,
            [category]: { ...prev[category], [key]: value }
        }));
    };

    const tabs: { id: SettingsTab; label: string; icon: string }[] = [
        { id: 'video', label: 'Video', icon: '🎥' },
        { id: 'connection', label: 'Connection', icon: '🌐' },
        { id: 'virtualcam', label: 'Virtual Camera', icon: '📷' },
        { id: 'advanced', label: 'Advanced', icon: '⚙️' },
    ];

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Settings</h2>
                    <button className="btn btn-icon" onClick={onClose}>✕</button>
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
                                <h3>Video Settings</h3>

                                <div className="form-group">
                                    <label className="form-label">Resolution</label>
                                    <select
                                        className="select"
                                        value={settings.video.resolution}
                                        onChange={e => updateSetting('video', 'resolution', e.target.value)}
                                    >
                                        <option value="480p">480p (SD)</option>
                                        <option value="720p">720p (HD)</option>
                                        <option value="1080p">1080p (Full HD)</option>
                                        <option value="4k">4K (Ultra HD)</option>
                                    </select>
                                    <p className="form-hint">Higher resolution requires more bandwidth</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Frame Rate</label>
                                    <select
                                        className="select"
                                        value={settings.video.fps}
                                        onChange={e => updateSetting('video', 'fps', e.target.value)}
                                    >
                                        <option value="24">24 FPS</option>
                                        <option value="30">30 FPS</option>
                                        <option value="60">60 FPS</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Quality</label>
                                    <select
                                        className="select"
                                        value={settings.video.quality}
                                        onChange={e => updateSetting('video', 'quality', e.target.value)}
                                    >
                                        <option value="low">Low (faster)</option>
                                        <option value="medium">Medium (balanced)</option>
                                        <option value="high">High (slower)</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Mirror Video</label>
                                    <div
                                        className={`toggle ${settings.video.mirror ? 'active' : ''}`}
                                        onClick={() => updateSetting('video', 'mirror', !settings.video.mirror)}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'connection' && (
                            <div className="settings-section">
                                <h3>Connection Settings</h3>

                                <div className="form-group">
                                    <label className="form-label">Web Server Port</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={settings.connection.port}
                                        onChange={e => updateSetting('connection', 'port', parseInt(e.target.value))}
                                    />
                                    <p className="form-hint">Port for the phone to connect to (default: 3000)</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">WebSocket Port</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={settings.connection.wsPort}
                                        onChange={e => updateSetting('connection', 'wsPort', parseInt(e.target.value))}
                                    />
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Auto-Reconnect</label>
                                    <div
                                        className={`toggle ${settings.connection.autoReconnect ? 'active' : ''}`}
                                        onClick={() => updateSetting('connection', 'autoReconnect', !settings.connection.autoReconnect)}
                                    />
                                    <p className="form-hint">Automatically reconnect when connection is lost</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Reconnect Delay (seconds)</label>
                                    <input
                                        type="number"
                                        className="input"
                                        value={settings.connection.reconnectDelay}
                                        onChange={e => updateSetting('connection', 'reconnectDelay', parseInt(e.target.value))}
                                        min={1}
                                        max={30}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab === 'virtualcam' && (
                            <div className="settings-section">
                                <h3>Virtual Camera Settings</h3>

                                <div className="form-group">
                                    <label className="form-label">Device Name</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={settings.virtualCam.deviceName}
                                        onChange={e => updateSetting('virtualCam', 'deviceName', e.target.value)}
                                    />
                                    <p className="form-hint">Name shown in other applications (Zoom, OBS, etc.)</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Auto-Start Virtual Camera</label>
                                    <div
                                        className={`toggle ${settings.virtualCam.autoStart ? 'active' : ''}`}
                                        onClick={() => updateSetting('virtualCam', 'autoStart', !settings.virtualCam.autoStart)}
                                    />
                                    <p className="form-hint">Automatically start virtual camera when stream begins</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'advanced' && (
                            <div className="settings-section">
                                <h3>Advanced Settings</h3>

                                <div className="form-group">
                                    <label className="form-label">Show Stats Overlay</label>
                                    <div
                                        className={`toggle ${settings.advanced.showStats ? 'active' : ''}`}
                                        onClick={() => updateSetting('advanced', 'showStats', !settings.advanced.showStats)}
                                    />
                                    <p className="form-hint">Display resolution, FPS, and latency on preview</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Low Latency Mode</label>
                                    <div
                                        className={`toggle ${settings.advanced.lowLatencyMode ? 'active' : ''}`}
                                        onClick={() => updateSetting('advanced', 'lowLatencyMode', !settings.advanced.lowLatencyMode)}
                                    />
                                    <p className="form-hint">Prioritize low latency over quality (may increase stuttering)</p>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Debug Mode</label>
                                    <div
                                        className={`toggle ${settings.advanced.debugMode ? 'active' : ''}`}
                                        onClick={() => updateSetting('advanced', 'debugMode', !settings.advanced.debugMode)}
                                    />
                                    <p className="form-hint">Show debug information in console</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={onClose}>Save Settings</button>
                </div>
            </div>
        </div>
    );
}
