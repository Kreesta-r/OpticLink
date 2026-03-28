import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { QRCodeSVG } from 'qrcode.react';
import { IconPlus, IconPhone, IconCopy } from '../Icons';

interface ConnectedDevice {
    id: string;
    deviceName: string;
    platform: string;
}

interface SidebarProps {
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
    connectedDevices?: ConnectedDevice[];
}

interface ConnectionInfo {
    ip: string;
    http_port: number;
    https_port: number;
}

export default function Sidebar({ status, connectedDevices = [] }: SidebarProps) {
    const [connInfo, setConnInfo] = useState<ConnectionInfo | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        invoke<string>('get_connection_info')
            .then(raw => setConnInfo(JSON.parse(raw)))
            .catch(console.error);
    }, []);

    // Phone client is served from the HTTPS port
    const phoneUrl = connInfo
        ? `https://${connInfo.ip}:${connInfo.https_port}/#phone`
        : '';

    const getStatusText = () => {
        switch (status) {
            case 'live': return 'Streaming';
            case 'connected': return 'Device ready';
            case 'connecting': return 'Connecting...';
            default: return 'Waiting for phone';
        }
    };

    const copyUrl = () => {
        if (!phoneUrl) return;
        navigator.clipboard.writeText(phoneUrl).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        });
    };

    return (
        <aside className="sidebar">
            {/* Sources section */}
            <div className="sidebar-section">
                <div className="panel-header">
                    <span>Sources</span>
                    <button className="btn btn-icon" title="Add Source" disabled>
                        <IconPlus size={13} />
                    </button>
                </div>

                <div className="source-item active">
                    <div className="source-icon">
                        <IconPhone size={16} />
                    </div>
                    <div className="source-info">
                        <div className="source-name">Phone Camera</div>
                        <div className="source-detail">
                            <span className={`status-dot ${status}`} />
                            {getStatusText()}
                        </div>
                        {connectedDevices.length > 0 && (
                            <div className="connected-devices-list">
                                {connectedDevices.map(d => (
                                    <div key={d.id} className="device-chip">
                                        <IconPhone size={11} />
                                        &nbsp;{d.deviceName}
                                        {d.platform && (
                                            <span className="device-platform"> · {d.platform}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Connect section */}
            <div className="sidebar-section">
                <div className="panel-header">
                    <span>Connect Device</span>
                </div>

                <div className="qr-panel">
                    {phoneUrl ? (
                        <>
                            <div className="qr-container">
                                <QRCodeSVG
                                    value={phoneUrl}
                                    size={140}
                                    bgColor="#ffffff"
                                    fgColor="#000000"
                                    level="M"
                                />
                            </div>
                            <p className="qr-hint">
                                Scan with your phone camera
                            </p>
                            <div className="qr-url">
                                <code title={phoneUrl}>{phoneUrl}</code>
                                <button
                                    className="btn btn-icon"
                                    onClick={copyUrl}
                                    title={copied ? 'Copied!' : 'Copy URL'}
                                >
                                    <IconCopy size={13} />
                                </button>
                            </div>
                            <p className="qr-https-note">
                                Accept the certificate warning on first visit
                            </p>
                        </>
                    ) : (
                        <p className="qr-loading">Detecting IP address...</p>
                    )}
                </div>
            </div>

            {/* How-to section */}
            <div className="sidebar-section sidebar-info">
                <p><strong>OpticLink</strong> turns your phone into a wireless webcam.</p>
                <ol>
                    <li>Scan QR code or open the URL on your phone</li>
                    <li>Accept the certificate warning once</li>
                    <li>Allow camera access</li>
                    <li>Click <strong>Start Virtual Cam</strong> below</li>
                    <li>Tap <strong>Start Streaming</strong> on your phone</li>
                    <li>Select <em>OpticLink Virtual Camera</em> in Zoom / OBS / Teams</li>
                </ol>
            </div>
        </aside>
    );
}
