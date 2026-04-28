import { useState, useEffect } from "react";
import { ref, onValue, update } from "firebase/database";
import { db } from "./firebase";

export default function Remote() {
  const [inputRoomId, setInputRoomId] = useState("");
  const [isJoined, setIsJoined] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [status, setStatus] = useState("idle"); // idle, joining, connected

  // ✅ 1. 處理 Hit 邏輯
  const handleRemoteHit = () => {
    if (isFlashing) {
      setIsFlashing(false);
      
      // 將當前時間傳回 Firebase，Master 會計算差距
      const roomPath = `rooms/${inputRoomId.toUpperCase()}`;
      update(ref(db, roomPath), {
        hitTime: Date.now(),
        signal: false 
      });

      // 震動回饋 (0.05秒)
      if (navigator.vibrate) navigator.vibrate(50);
    }
  };

  // ✅ 2. 處理 Join 邏輯
  const handleJoin = () => {
    if (!inputRoomId) return alert("Please enter Room ID");
    
    setStatus("joining");
    const roomRef = ref(db, `rooms/${inputRoomId.toUpperCase()}`);
    
    // 監聽 Firebase 資料
    onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setIsJoined(true);
        setStatus("connected");

        // 如果 Master 發出 signal: true，手機就閃燈
        if (data.signal === true) {
          setIsFlashing(true);
          // 長震動提醒 (0.2秒)
          if (navigator.vibrate) navigator.vibrate(200);
          
          // 安全機制：如果玩家 2 秒都唔撳，自動熄燈防止燒 Mon
          setTimeout(() => setIsFlashing(false), 2000);
        }
      } else {
        setStatus("idle");
        alert("Room not found! Make sure Master is running.");
      }
    });
  };

  // ✅ 3. UI - 已連線介面 (變色閃燈畫面)
  if (isJoined) {
    return (
      <div 
        onPointerDown={(e) => {
          e.preventDefault();
          handleRemoteHit();
        }}
        className={`h-[100dvh] w-screen transition-colors duration-75 flex flex-col items-center justify-center cursor-pointer overflow-hidden ${
          isFlashing ? "bg-white" : "bg-gray-950"
        }`}
      >
        {isFlashing ? (
          <div className="flex flex-col items-center">
            <span className="text-black font-black text-7xl italic animate-pulse">HIT!</span>
            <span className="text-black/40 text-xs font-bold mt-4 uppercase">Touch Anywhere</span>
          </div>
        ) : (
          <div className="text-center opacity-40">
            <div className="w-20 h-20 border-2 border-violet-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <div className="w-10 h-10 bg-violet-500 rounded-full blur-xl animate-pulse" />
            </div>
            <p className="text-white font-bold tracking-[0.4em] text-[10px] uppercase">
              Waiting for Signal
            </p>
            <p className="text-white/20 text-[9px] mt-2">Room: {inputRoomId.toUpperCase()}</p>
          </div>
        )}
        
        {/* 退出按鈕 (細細個喺底) */}
        <button 
          onClick={() => window.location.reload()}
          className="absolute bottom-10 px-4 py-2 text-[9px] text-white/20 uppercase font-bold tracking-widest border border-white/5 rounded-full"
        >
          Exit Room
        </button>
      </div>
    );
  }

  // ✅ 4. UI - 初始輸入 ID 介面
  return (
    <div className="h-[100dvh] w-screen bg-gray-950 flex flex-col items-center justify-center p-8 text-white select-none">
      <div className="mb-12 text-center">
        <div className="w-16 h-16 bg-violet-600/20 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-violet-500/30">
          <div className="w-2 h-2 bg-violet-500 rounded-full animate-ping" />
        </div>
        <h1 className="text-3xl font-black italic tracking-tighter">
          REMOTE<span className="text-violet-500">SATELLITE</span>
        </h1>
        <p className="text-white/30 text-[10px] uppercase tracking-widest mt-2 font-bold">ReactionPro Extension</p>
      </div>

      <div className="w-full max-w-xs space-y-4">
        <div className="relative">
          <input
            type="text"
            placeholder="ENTER ROOM ID"
            value={inputRoomId}
            onChange={(e) => setInputRoomId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-5 text-center text-2xl font-mono focus:border-violet-500 focus:bg-white/10 outline-none transition-all placeholder:text-white/10"
          />
        </div>
        
        <button
          onClick={handleJoin}
          disabled={status === "joining"}
          className={`w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] transition-all active:scale-95 shadow-xl ${
            status === "joining" 
              ? "bg-gray-800 text-white/50 cursor-wait" 
              : "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-950/20"
          }`}
        >
          {status === "joining" ? "Connecting..." : "Join Training"}
        </button>
      </div>

      <div className="mt-16 flex flex-col items-center gap-2 opacity-20">
        <div className="w-1 h-8 bg-gradient-to-b from-violet-500 to-transparent" />
        <p className="text-[9px] max-w-[200px] text-center uppercase leading-relaxed font-medium">
          The remote device acts as the <span className="text-white font-bold">Right Side</span> sensor during Advanced training.
        </p>
      </div>
    </div>
  );
}