/*
import { useState, useRef, useEffect } from "react";
import { Peer, DataConnection } from "peerjs";

export default function Remote() {
  const [targetId, setTargetId] = useState("");
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState("disconnected"); // disconnected, connecting, connected
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    const peer = new Peer({
        // 強制指定 PeerJS 官方伺服器，避免自動搜尋出錯
        host: "0.0.peerjs.com",
        port: 443,
        secure: true,
        debug: 3, // 喺 Console 睇到最詳細嘅連線過程
        config: {
            iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
            ],
            // 解決 negotiation-failed 嘅關鍵：強制使用統一協定
            sdpSemantics: "unified-plan" 
        }
    });
    peerRef.current = peer;
    return () => peer.destroy();
  }, []);

  const handleConnect = () => {
    if (!peerRef.current || !targetId) return;
    setStatus("connecting");
    
    const newConn = peerRef.current.connect(targetId.trim(), {
        reliable: true, // 確保數據傳輸可靠
        serialization: 'json',
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
*/

import { useState, useRef, useEffect } from "react";
import { Peer, DataConnection } from "peerjs";

export default function Remote() {
  const [targetId, setTargetId] = useState("");
  const [conn, setConn] = useState<DataConnection | null>(null);
  const [status, setStatus] = useState("disconnected");
  const [isFlashing, setIsFlashing] = useState(false); // Controls the flash
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    const peer = new Peer({
      //host: "0.0.peerjs.com",
      //port: 443,
      //secure: true,
      debug: 1, 
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
        sdpSemantics: "unified-plan" 
      }
    });
    peerRef.current = peer;
    return () => peer.destroy();
  }, []);

  const handleConnect = () => {
    if (!peerRef.current || !targetId) return;
    setStatus("connecting");
    
    const newConn = peerRef.current.connect(targetId.trim().toLowerCase(), {
      reliable: true,
      serialization: 'json',
    });

    // 加一個 Timeout 檢查
    const connectionTimeout = setTimeout(() => {
      if (status !== "connected") {
        setStatus("disconnected");
        alert("Connection timeout - Check Host ID");
      }
    }, 10000);
    
    newConn.on("open", () => {
      clearTimeout(connectionTimeout);
      setConn(newConn);
      setStatus("connected");
    });

    newConn.on("data", (data: any) => {
      console.log("📩 Received:", data);
      
      // Handle the flash signal from the Master
      if (data.type === "SIGNAL_FLASH") {
        setIsFlashing(true);
        
        // Vibrate for physical feedback
        if (navigator.vibrate) navigator.vibrate(200);

        // Turn off flash after 500ms
        setTimeout(() => setIsFlashing(false), 500);
      }
    });

    newConn.on("close", () => setStatus("disconnected"));
    newConn.on("error", () => setStatus("disconnected"));
  };

  // 1. 定義一個 Function 處理 Hit
  const handleRemoteHit = () => {
    if (isFlashing && conn) {
      console.log("🎯 Remote HIT!");
      conn.send({ type: "HIT" }); // 傳送返 Master
      setIsFlashing(false); // 即刻熄燈
      if (navigator.vibrate) navigator.vibrate(50);
    } else {
      console.log("❌ Misfire: Screen wasn't white.");
    }
  };

  // UI for when connected (Acts as the "Right Side" of the game)
  // Inside your Remote component (status === "connected")
  if (status === "connected") {
    return (
      <div 
        onPointerDown={handleRemoteHit}
        className={`h-screen w-screen transition-colors duration-75 flex flex-col items-center justify-center cursor-pointer ${
          isFlashing ? "bg-white" : "bg-gray-950"
        }`}
      >
        {isFlashing ? (
          <span className="text-black font-black text-4xl italic animate-pulse">HIT NOW!</span>
        ) : (
          <div className="text-center">
            <div className="w-24 h-24 border-4 border-violet-500/20 rounded-full flex items-center justify-center mx-auto">
              <div className="w-12 h-12 bg-violet-500 rounded-full blur-xl animate-pulse" />
            </div>
            <p className="mt-8 text-white/20 uppercase tracking-[0.3em] text-[10px] font-black">
              Ready for Signal
            </p>
          </div>
        )}
      </div>
    );
  }

  // UI for initial setup
  return (
    <div className="h-screen w-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-white">
      <div className="mb-12 text-center">
        <h1 className="text-2xl font-black italic tracking-tighter">
          REMOTE<span className="text-violet-500">SATELLITE</span>
        </h1>
        <p className="text-white/30 text-[10px] uppercase tracking-widest mt-1">Right-Side Flash Device</p>
      </div>

      <input
        type="text"
        placeholder="Enter Host ID"
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="w-full max-w-xs bg-white/5 border border-white/10 rounded-2xl px-4 py-4 mb-4 text-center text-xl font-mono focus:border-violet-500 outline-none transition-all"
      />
      
      <button
        onClick={handleConnect}
        disabled={status === "connecting"}
        className="w-full max-w-xs bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 py-4 rounded-2xl font-black uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-violet-950/20"
      >
        {status === "connecting" ? "Linking..." : "Link to Master"}
      </button>

      <p className="mt-10 text-white/10 text-[9px] max-w-[200px] text-center uppercase leading-relaxed">
        Ensure Master is in <span className="text-white/30">Advanced Mode</span> to begin sync.
      </p>
    </div>
  );
}