import { useEffect, useRef, useState } from 'react';

const SIGNALING_SERVER = 'ws://localhost:3001/ws';

export default function DesktopViewer() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [status, setStatus] = useState('Waiting for Phone...');
    const [ip, setIp] = useState('localhost');
    const wsRef = useRef<WebSocket | null>(null);
    const pcRef = useRef<RTCPeerConnection | null>(null);

    useEffect(() => {
        // Fetch IP
        import("@tauri-apps/api/core").then(({ invoke }) => {
            invoke('get_ip').then((ip: any) => setIp(ip));
        });

        const ws = new WebSocket(SIGNALING_SERVER);
        wsRef.current = ws;

        ws.onopen = () => {
            setStatus('Signaling Connected. Waiting for Offer...');
            ws.send(JSON.stringify({ type: 'join', id: 'desktop' }));
        };

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
                        setStatus('Video Connected');
                    }
                };

                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        ws.send(JSON.stringify({
                            type: 'ice-candidate',
                            candidate: event.candidate.candidate,
                            sdp_mid: event.candidate.sdpMid,
                            sdp_m_line_index: event.candidate.sdpMLineIndex,
                            target: 'phone' // Assuming phone ID is unknown or handled by server broadcast
                        }));
                    }
                };

                await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp: msg.sdp }));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);

                ws.send(JSON.stringify({
                    type: 'answer',
                    sdp: answer.sdp,
                    target: 'phone'
                }));
            } else if (msg.type === 'ice-candidate') {
                if (pcRef.current) {
                    await pcRef.current.addIceCandidate(new RTCIceCandidate({ candidate: msg.candidate, sdpMid: msg.sdp_mid, sdpMLineIndex: msg.sdp_m_line_index }));
                }
            }
        };

        return () => {
            ws.close();
            pcRef.current?.close();
        };
    }, []);

    return (
        <div className="desktop-viewer" style={{ padding: 20 }}>
            <h2>OpticLink Desktop</h2>
            <div style={{ border: '2px solid #333', borderRadius: 8, overflow: 'hidden', width: 640, height: 480, background: '#000' }}>
                <video ref={videoRef} autoPlay style={{ width: '100%', height: '100%' }} />
            </div>
            <p>Status: {status}</p>
            <p>
                Connect phone to: <br />
                <code>http://{ip}:1420/#phone</code>
            </p>
        </div>
    );
}
