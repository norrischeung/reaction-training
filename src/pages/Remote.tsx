import { useState, useRef, useEffect } from "react";
import { Peer, DataConnection } from "peerjs";

export default function Remote() {
  const [targetId, setTargetId] = useState("");
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState("disconnected"); // disconnected, connecting, connected
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    const peer = new Peer({
      config: {
        'iceServers': [
          { urls: 'stun:stun.l.google.com:19302' }, // 用 Google 嘅免費 STUN server 幫手穿透
        ]
      }
    });
    peerRef.current = peer;
    return () => peer.destroy();
  }, []);

  const handleConnect = () => {
    if (!peerRef.current || !targetId) return;
    setStatus("connecting");
    
    const newConn = peerRef.current.connect(targetId.trim(), {
        reliable: true // 確保數據傳輸可靠
    });
    
    newConn.on("open", () => {
      setConn(newConn);
      setStatus("connected");
    });

    newConn.on("data", (data) => {
        console.log("📩 Received from master:", data);
        if (data === "SERVER_READY") {
        setConn(newConn);
        setStatus("connected");
        }
    });

    newConn.on("error", (err) => {
      alert("連線失敗: " + err.type);
      setStatus("disconnected");
    });
  };

  const sendHit = () => {
    if (conn) conn.send("HIT");
    if (navigator.vibrate) navigator.vibrate(50); // 手感反饋
  };

  if (status === "connected") {
    return (
      <div className="h-screen w-screen bg-gray-950 flex flex-col items-center justify-center p-8">
        <button
          onPointerDown={sendHit}
          className="w-72 h-72 bg-violet-600 active:bg-violet-400 rounded-full shadow-[0_0_60px_rgba(139,92,246,0.4)] border-8 border-white/10 flex items-center justify-center"
        >
          <span className="text-5xl font-black text-white italic">HIT!</span>
        </button>
        <p className="mt-8 text-white/20 uppercase tracking-widest text-[10px]">Connected to {targetId}</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
      <h1 className="text-xl font-black mb-8 italic">REMOTE<span className="text-violet-500">PAD</span></h1>
      <input
        type="text"
        placeholder="Enter Host ID"
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="w-full max-w-xs bg-white/5 border border-white/10 rounded-xl px-4 py-3 mb-4 text-center text-lg focus:border-violet-500 outline-none"
      />
      <button
        onClick={handleConnect}
        className="w-full max-w-xs bg-violet-600 py-4 rounded-xl font-bold active:scale-95 transition-all"
      >
        {status === "connecting" ? "Connecting..." : "Connect to Master"}
      </button>
    </div>
  );
}