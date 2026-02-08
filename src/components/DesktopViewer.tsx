import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { QRCodeSVG } from 'qrcode.react';

export default function DesktopViewer() {
    const [status, setStatus] = useState('Initializing...');
    const [ip, setIp] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        // Fetch local IP
        invoke<string>('get_ip').then(setIp).catch(console.error);

        const ws = new WebSocket('ws://localhost:3001');
        wsRef.current = ws;

        ws.onopen = () => setStatus('Waiting for phone...');

        ws.onmessage = async (event) => {
            const msg = JSON.parse(event.data);

            if (msg.type === 'offer') {
                setStatus('Received Offer. Connecting...');
                const pc = new RTCPeerConnection({
                    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
                });
                pcRef.current = pc;

                pc.ontrack = (event) => {
                    if (videoRef.current) {
                        videoRef.current.srcObject = event.streams[0];
                        setStatus('Streaming Active');
                    }
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        ws.send(JSON.stringify({
                            type: 'ice-candidate',
                            candidate: event.candidate.candidate,
                            sdp_mid: event.candidate.sdpMid,
                            sdp_m_line_index: event.candidate.sdpMLineIndex,
                            target: 'phone'
                        }));
                    }
                };

                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'offer',
                    sdp: msg.sdp
                }));

                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                ws.send(JSON.stringify({
                    type: 'answer',
                    sdp: answer.sdp,
                    target: 'phone'
                }));

            } else if (msg.type === 'ice-candidate') {
                if (pcRef.current) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate({
                        candidate: msg.candidate,
                        sdpMid: msg.sdp_mid,
                        sdpMLineIndex: msg.sdp_m_line_index
                    }));
                }
            }
        };

        return () => {
            ws.close();
            if (pcRef.current) pcRef.current.close();
        };
    }, []);

    const connectionUrl = ip ? `http://${ip}:3000/#phone` : 'Loading...';

    return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white p-4">
            <h1 className="text-3xl font-bold mb-4 text-cyan-400">OpticLink Desktop</h1>

            <div className="relative w-full max-w-4xl aspect-video bg-black rounded-lg overflow-hidden border-2 border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                />

                {status !== 'Streaming Active' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
                        <div className="bg-gray-800 p-6 rounded-xl border border-gray-700 max-w-sm w-full text-center">
                            <p className="text-gray-400 mb-4">{status}</p>

                            {ip && (
                                <div className="space-y-4">
                                    <div className="bg-white p-2 rounded-lg mx-auto w-fit">
                                        <QRCodeSVG value={connectionUrl} size={160} />
                                    </div>

                                    <div className="space-y-2">
                                        <p className="text-sm text-gray-400">Scan or visit on your phone:</p>
                                        <div className="flex items-center gap-2 bg-gray-900 p-2 rounded border border-gray-700">
                                            <code className="flex-1 text-cyan-300 text-sm truncate">{connectionUrl}</code>
                                            <button
                                                onClick={() => navigator.clipboard.writeText(connectionUrl)}
                                                className="p-1 hover:bg-gray-700 rounded text-gray-400 transition-colors"
                                                title="Copy URL"
                                            >
                                                📋
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-6 flex gap-4">
                <div className="px-4 py-2 bg-gray-800 rounded-lg border border-gray-700">
                    <span className="text-gray-400 text-sm">Status:</span>
                    <span className={`ml-2 font-mono ${status === 'Streaming Active' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {status}
                    </span>
                </div>
            </div>
        </div>
    );
}
