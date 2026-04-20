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
      secure: true,
      debug: 1, 
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
          {
            urls: "turn:openrelay.metered.ca:443",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
        //sdpSemantics: "unified-plan" 
        iceCandidatePoolSize: 10,
      }
    });
    peerRef.current = peer;
    return () => peer.destroy();
  }, []);

  const handleConnect = () => {
    if (!peerRef.current || !targetId) return;
    setStatus("connecting");
    
    const newConn = peerRef.current.connect(targetId.trim(), {
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
      console.log("✅ Connection opened!");
      clearTimeout(connectionTimeout);
      setConn(newConn);
      setStatus("connected");
    });

    newConn.on("data", (data: any) => {
      console.log("📩 Received:", data);

      // 💡 只要收到呢個，電話就知道自己連線成功，可以轉畫面
      /*
      if (data.type === "SET_REMOTE_MODE" || data === "SERVER_READY") {
        setConn(newConn);
        setStatus("connected");
      }
      */

      if (data.type === "CONNECTION_SUCCESS") {
        console.log("Master 說他準備好了！");
        setConn(newConn);
        setStatus("connected"); // 手機正式轉去 HIT 畫面
      }
      
      // 認得 Master 射過嚟嘅 Flash 訊號
      if (data.type === "SIGNAL_FLASH") {
        setIsFlashing(true);
        if (navigator.vibrate) navigator.vibrate(200);

        // 安全機制：500ms 後自動熄燈，防止畫面卡死喺白色
        setTimeout(() => setIsFlashing(false), 500);
      }
    });

    newConn.on("close", () => setStatus("disconnected"));
    //newConn.on("error", () => setStatus("disconnected"));
  };

  // 1. 定義一個 Function 處理 Hit
  const handleRemoteHit = () => {
    // 只有閃緊燈且連線緊先可以 HIT
    if (isFlashing && conn && conn.open) {
      setIsFlashing(false); // 💡 第一時間熄燈，視覺反饋最快
      
      // 傳送 HIT 訊號返去 Master 停錶
      conn.send({ type: "HIT" }); 
      
      if (navigator.vibrate) navigator.vibrate(50); // 短震動反饋
      console.log("🎯 HIT sent to Master!");
    } else {
      console.log("❌ 無效點擊：燈未閃或連線已斷");
    }
  };

  // UI for when connected (Acts as the "Right Side" of the game)
  // Inside your Remote component (status === "connected")
  if (status === "connected") {
    return (
      <div 
        // 💡 使用 onPointerDown 代替 onClick，反應會快 300ms
        onPointerDown={(e) => {
          e.preventDefault();
          handleRemoteHit();
        }}
        className={`h-[100dvh] w-screen transition-colors duration-75 flex flex-col items-center justify-center cursor-pointer ${
          isFlashing ? "bg-white" : "bg-gray-950"
        }`}
      >
        {isFlashing ? (
          <span className="text-black font-black text-5xl italic animate-pulse">HIT!</span>
        ) : (
          <div className="text-center opacity-40">
            <div className="w-20 h-20 border-2 border-violet-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-10 h-10 bg-violet-500 rounded-full blur-xl animate-pulse" />
            </div>
            <p className="text-white font-bold tracking-[0.4em] text-[10px] uppercase">
              Waiting for Signal
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