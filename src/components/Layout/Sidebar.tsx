import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { QRCodeSVG } from 'qrcode.react';

interface SidebarProps {
    status: 'disconnected' | 'connecting' | 'connected' | 'live';
}

export default function Sidebar({ status }: SidebarProps) {
    const [ip, setIp] = useState<string | null>(null);

    useEffect(() => {
        invoke<string>('get_ip').then(setIp).catch(console.error);
    }, []);

    const connectionUrl = ip ? `http://${ip}:3000/#phone` : '';

    const getStatusText = () => {
        switch (status) {
            case 'live': return 'Streaming';
            case 'connected': return 'Waiting for stream';
            case 'connecting': return 'Connecting...';
            default: return 'Disconnected';
        }
    };

    return (
        <aside className="sidebar">
            {/* Sources Section */}
            <div className="sidebar-section">
                <div className="panel-header">
                    <span>Sources</span>
                    <button className="btn btn-icon" title="Add Source">+</button>
                </div>

                <div className="source-item active">
                    <div className="source-icon">📱</div>
                    <div className="source-info">
                        <div className="source-name">Phone Camera</div>
                        <div className="source-detail" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`status-dot ${status}`}></span>
                            {getStatusText()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Connection Section */}
            <div className="sidebar-section">
                <div className="panel-header">
                    <span>Connect Device</span>
                </div>

                <div className="qr-panel">
                    {ip ? (
                        <>
                            <div className="qr-container">
                                <QRCodeSVG value={connectionUrl} size={140} />
                            </div>
                            <p style={{ marginBottom: 12, color: 'var(--text-secondary)', fontSize: 12 }}>
                                Scan with your phone camera
                            </p>
                            <div className="qr-url">
                                <code>{connectionUrl}</code>
                                <button
                                    className="btn btn-icon"
                                    onClick={() => navigator.clipboard.writeText(connectionUrl)}
                                    title="Copy URL"
                                >
                                    📋
                                </button>
                            </div>
                        </>
                    ) : (
                        <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
                    )}
                </div>
            </div>

            {/* Info Section */}
            <div className="sidebar-section" style={{ padding: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <p><strong>OpticLink</strong> turns your phone into a wireless webcam.</p>
                    <p style={{ marginTop: 8 }}>1. Scan QR code with phone</p>
                    <p>2. Allow camera access</p>
                    <p>3. Start streaming!</p>
                </div>
            </div>
        </aside>
    );
}
