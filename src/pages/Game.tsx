import { useState, useEffect, useRef, useCallback } from "react";
import { ref, onValue, set, update } from "firebase/database";
import { db } from "./firebase";
import { SettingsIcon } from "lucide-react";

type GameState = "idle" | "countdown" | "reaction" | "waiting_restart" | "remote_control";
type mode = "basic" | "advanced";

interface Settings {
  countdownTime: number;
  autoRestart: boolean;
  restartDelay: number;
  hideTimer: boolean;
  randomTime: boolean;
  randomMin: number;
  randomMax: number;
  directionMode: number; // 0: Both, 1: Left only, 2: Random each round
}

export default function Game() {

  // Game states
  const [mode, setMode] = useState<mode>("basic");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [totalCs, setTotalCs] = useState(500);
  const [activeTarget, setActiveTarget] = useState<number | null>(null);
  const [restartCountdown, setRestartCountdown] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    countdownTime: 5,
    autoRestart: false,
    restartDelay: 3,
    directionMode: 2,
    hideTimer: false,
    randomTime: false,
    randomMin: 3,
    randomMax: 10,
  });
  const [settingsInput, setSettingsInput] = useState({
    countdownTime: "5",
    restartDelay: "3",
    randomMin: "3",
    randomMax: "10",
  });

  //handle offline
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    // 如果斷網，且當前是 Advanced Mode，自動跳回 Basic
    if (!isOnline && mode === 'advanced') {
      setMode('basic');
      // 可以加個 toast 提示
      console.log("Offline detected: Switched to Basic Mode");
    }
  }, [isOnline, mode]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // --- Firebase & Remote States ---
  const [roomId] = useState(Math.random().toString(36).substring(2, 8).toUpperCase());
  const [isRemoteConnected, setIsRemoteConnected] = useState(false);
  const [startTime, setStartTime] = useState<number>(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [leftActive, setLeftActive] = useState(false);
  const [rightActive, setRightActive] = useState(false);

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Helpers ---
  const clearTimers = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (restartRef.current) clearInterval(restartRef.current);
  }, []);

  // --- Core Game Logic ---
  const startGame = useCallback(() => {
    clearTimers();
    setLeftActive(false);
    setRightActive(false);
    setActiveTarget(null);
    setStartTime(0);
    
    let seconds = settings.countdownTime;
    if (settings.randomTime) {
      const min = settings.randomMin;
      const max = settings.randomMax;
      seconds = Math.random() * (max - min) + min;
    }
    const startCs = Math.round(seconds * 100);
    setTotalCs(startCs);
    setGameState("countdown");

    let remaining = startCs;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setTotalCs(remaining);
      if (remaining <= 0) {
        clearInterval(countdownRef.current!);
        const nextIndex = Math.floor(Math.random() * settings.directionMode);
        setActiveTarget(nextIndex);

        if (mode === "advanced") {
          setStartTime(Date.now());
          setGameState("reaction");
          
          //Picked Left
          if (nextIndex % 2 === 0) {
            setLeftActive(true);
            setRightActive(false);
          } else {
            setLeftActive(false);
            setRightActive(true);
            // ✅ Firebase Update: 傳送訊號給手機
            update(ref(db, `rooms/${roomId}`), { 
              signal: true, 
              signalSentAt: Date.now(),
              hitTime: 0 // 重設 hitTime
            });
          } 
        } else {
          setLeftActive(nextIndex % 2 === 0);
          setRightActive(nextIndex % 2 === 1);
          setGameState("waiting_restart");
          if (settings.autoRestart) triggerAutoRestart();
        }
      }
    }, 10);
  }, [settings, clearTimers, mode, roomId]);

  const getDirectionInfo = (idx: number) => {
    const mapping: Record<number, { label: string, arrow: string }> = {
      0: { label: "NET",  arrow: "↖" }, // 或用 "↑"
      1: { label: "NET",  arrow: "↗" }, // 或用 "↑"
      2: { label: "MID",  arrow: "←" },
      3: { label: "MID",  arrow: "→" },
      4: { label: "BACK", arrow: "↙" }, // 或用 "↓"
      5: { label: "BACK", arrow: "↘" }, // 或用 "↓"
    };
    return mapping[idx] || { label: "", arrow: "" };
  };

  // --- Timer & Auto Restart ---
  const triggerAutoRestart = useCallback(() => {
    if (!settings.autoRestart) return;
    let remaining = settings.restartDelay;
    setRestartCountdown(remaining);
    setGameState("waiting_restart");

    restartRef.current = setInterval(() => {
      remaining -= 1;
      setRestartCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(restartRef.current!);
        startGame();
      }
    }, 1000);
  }, [settings.autoRestart, settings.restartDelay, startGame]);

  const [restartProgress, setRestartProgress] = useState(100);

  //Function for the Mock Button & Bluetooth
  const stopReactionTimer = (manualEndTime?: number) => {
    const endTime = manualEndTime || Date.now();
    // 1. Only run if we are actually in the 'reaction' phase
    if (gameState === "reaction" && startTime) {
      const duration = (endTime - startTime) / 1000;
      
      // Ignore accidental "instant" hits (less than 50ms)
      if (duration < 0.05) return;

      setReactionTime(duration);

      // 2. Turn off the colors/highlights immediately
      setLeftActive(false);
      setRightActive(false);
      setActiveTarget(null);

      // 3. Move to the summary state
      setGameState("waiting_restart");

      // 4. Handle Auto-Restart if the checkbox is ON
      if (settings.autoRestart) {
        const delay = parseFloat(settingsInput.restartDelay || "3") * 1000;
        
        // Clear any existing restart timers first
        if (restartRef.current) clearInterval(restartRef.current);
        
        // Start the visual countdown (optional, see Step 2)
        let remaining = parseInt(settingsInput.restartDelay);
        setRestartCountdown(remaining);
        
        restartRef.current = setInterval(() => {
          remaining -= 1;
          setRestartCountdown(remaining);
          if (remaining <= 0) {
            if (restartRef.current) clearInterval(restartRef.current);
            startGame();
          }
        }, 1000);
      }
    }
  };

  // --- Firebase Sync Logic ---
  useEffect(() => {
    const roomRef = ref(db, `rooms/${roomId}`);
    
    // 初始化 Room
    set(roomRef, {
      status: "idle",
      signal: false,
      hitTime: 0,
      connected: true
    });

    // 監聽手機端的數據
    const unsubscribe = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        // 1. 更新連線狀態 (只要 data 存在就代表連咗線)
        // 你可以根據手機端是否有更新一個 'lastSeen' 嚟做更準確嘅判斷
        setIsRemoteConnected(true);

        // 2. 處理反應時間 (手機端傳回 hitTime)
        if (data.hitTime > 0 && gameState === "reaction") {
          stopReactionTimer(data.hitTime);
          // 收到後重設 Firebase 狀態
          update(roomRef, { hitTime: 0, signal: false });
        }
      }
    });

    return () => unsubscribe();
  }, [roomId, gameState]);

  const handleRestart = () => {
    clearTimers();
    setActiveTarget(null);
    setLeftActive(false);
    setRightActive(false);
    setStartTime(0);
    setRestartCountdown(0);
    setGameState("idle");
    setTotalCs(settings.countdownTime * 100);
    

    // ✅ 同步重設 Firebase 狀態，讓手機端也回到等待畫面
    if (roomId) {
      const roomRef = ref(db, `rooms/${roomId}`);
      update(roomRef, {
        signal: false,
        hitTime: 0,
        //status: "idle" // 如果你 Remote 冇聽 status，呢行可以唔使
      }).then(() => {
        console.log("Firebase Reset Successful");
      }).catch(err => {
        console.error("Firebase Reset Error:", err);
      });
    }
  };

  const handleSaveSettings = () => {
    const ct = parseInt(settingsInput.countdownTime, 10);
    const rd = parseInt(settingsInput.restartDelay, 10);
    const rmin = parseFloat(settingsInput.randomMin);
    const rmax = parseFloat(settingsInput.randomMax);
    
    const validCt = isNaN(ct) || ct < 1 ? 5 : ct;
    const validMin = isNaN(rmin) || rmin < 1 ? 1 : rmin;
    const validMax = isNaN(rmax) || rmax <= validMin ? validMin + 1 : rmax;
    
    setSettings((prev) => ({
      ...prev,
      countdownTime: validCt,
      restartDelay: isNaN(rd) || rd < 1 ? 3 : rd,
      randomMin: validMin,
      randomMax: validMax,
    }));
    
    setTotalCs(validCt * 100);
    setShowSettings(false);
  };

  // 複製 Room ID 的 Function (取代原本 Peer ID)
  const handleCopy = () => {
    if (navigator.clipboard && roomId) {
      navigator.clipboard.writeText(roomId);
      alert("Room ID copied: " + roomId);
    }
  };

  const handleSensorHit = (side: string) => {
    if (gameState === "reaction") { // Changed from "countdown" to "reaction"
      // Case A: Main device was the target (Left)
      if (side === 'left' && leftActive) {
        stopReactionTimer();
      } 
      // Case B: Basic mode where Main device handles both
      else if (mode === 'basic' && side === 'right' && rightActive) {
        stopReactionTimer();
      }
    }
  };

  const formatTime = (cs: number) => {
    const secs = Math.floor(cs / 100);
    const cents = cs % 100;
    return `${String(secs).padStart(2, "0")}:${String(cents).padStart(2, "0")}`;
  };
 
  /*
  // Bluetooth-related states (for future use)
  const [isConnected, setIsConnected] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState<any>(null);
  

  // Function to connect to the Bluetooth sensor
  const connectSensor = async () => {
    try {
      const nav = navigator as any;
      // 1. Search for your specific Badminton Sensor
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ name: 'Badminton-Sensor-1' }],
        optionalServices: ['4fafc201-1fb5-459e-8fcc-c5c9c331914b'] // This matches the ESP32 ID
      });

      // Add a check to make sure gatt exists
      if (!device.gatt) {
        throw new Error("Bluetooth GATT not found on this device.");
      }

      // 2. Connect to the "Brain" of the sensor
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('4fafc201-1fb5-459e-8fcc-c5c9c331914b');
      const characteristic = await service.getCharacteristic('beb5483e-36e1-4688-b7f5-ea07361b26a8');

      // 3. Start listening for the button press
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        // THIS IS THE TRIGGER: When physical button is hit, stop the game timer!
        stopReactionTimer(); 
      });

      setIsConnected(true);
      setBluetoothDevice(device);
      alert("Sensor Connected! 🏸");

    } catch (error) {
      console.error("Bluetooth Error:", error);
    }
  };
  */

  //Effect starts the reaction timer when the countdown ends
  const getGrade = (time: number) => {
    if (time < 0.50) return { label: "ELITE ⚡", color: "text-yellow-400" };
    if (time < 1.00) return { label: "PRO 🏸", color: "text-green-400" };
    if (time < 1.50) return { label: "GOOD 👍", color: "text-blue-400" };
    return { label: "KEEP TRAINING!", color: "text-gray-400" };
  };

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-gray-950 text-white select-none overflow-hidden" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
      
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 pt-[env(safe-area-inset-top)] bg-gray-950/50 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center justify-between px-6 h-16 relative">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">             
              <h1 className="text-xl font-black tracking-tighter text-white">
                TARGET<span className="text-violet-500">PULSAR</span>
              </h1>
            </div>
            
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-white/40 uppercase tracking-widest">
              {mode}
            </span>
          </div>

          <div className="flex items-center gap-2">         
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95"
            >
              <SettingsIcon className="w-6 h-6 text-white/70" />
              {/* Connection status indicator */}
              <div className={`w-2 h-2 rounded-full transition-colors duration-500 ${
                isOnline 
                  ? 'bg-violet-500'           // 正常連線：紫色
                  : 'bg-red-600 animate-pulse ' // 斷網：紅色 + 呼吸燈效果
              }`} />
            </button>
          </div>
        </div>
      </header>

      {/* ⚠️ 重要：因為 Header 變成了 fixed，你需要給後面的內容加一個墊片，防止內容被 Header 擋住 */}
      <div className="h-[calc(64px+env(safe-area-inset-top))]" />

      {/* Setting Panel */}
      {showSettings && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6"
          onClick={() => setShowSettings(false)}
        >
          <div 
            className="absolute top-12 sm:top-16 right-2 sm:right-4 z-50 
                      bg-gray-900/95 backdrop-blur-xl border border-white/10 
                      rounded-2xl p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] 
                      w-[calc(100vw-1rem)] sm:w-80 max-w-xs
                      max-h-[80vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/*
            <div className="flex justify-between mb-6 px-1">
              <h2 className="text-lg font-bold text-white/95 whitespace-nowrap tracking-tight">Advanced Settings</h2>
                
                <button
                  onClick={connectSensor}
                  className={`shrink-0 px-2 py-1 rounded-md transition-all duration-300 border ${
                    isConnected 
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                      : "bg-white/5 text-white/40 border border-white/5 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black tracking-tighter uppercase">
                      {isConnected ? "Connected" : "Offline"}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      isConnected ? "bg-blue-400 animate-pulse" : "bg-white/20"
                    }`} />
                  </div>
                </button>
            </div>
             */}

            <div className="mb-6">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-3 block">
                Training Mode
              </label>
              <div className="p-1 bg-black/40 rounded-xl flex gap-1">
                <button
                  onClick={() => { handleRestart(); setMode("basic"); }}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    mode === "basic" ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white/60"
                  }`}
                >
                  BASIC
                </button>
                <button
                  disabled={!isOnline}
                  onClick={() => { handleRestart(); setMode("advanced"); }}
                  className={`relative flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    mode === "advanced" 
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-900/20" 
                      : "text-white/30 hover:text-white/60"
                  } ${!isOnline ? 'opacity-30 cursor-not-allowed' : 'active:scale-95'}`}
                >
                  <span className={!isOnline ? 'blur-[1px]' : ''}>Advanced</span>
                  {/* 離線時的小鎖頭或提示 */}
                  {!isOnline && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] bg-black/60 px-2 py-0.5 rounded text-red-400 font-black">
                        WIFI REQUIRED
                      </span>
                    </div>
                  )}
                </button>
              </div>
            </div>

            {/* Firebase Multi-Device Section */}
            {mode === "advanced" && (
              <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Multi-Device (Firebase)</h3>
                
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/40">Room ID (Enter this on Phone)</span>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-black/40 px-3 py-2 rounded-lg font-mono text-sm text-white truncate">
                      {roomId}
                    </div>
                    <button 
                      onClick={handleCopy}
                      className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-xs transition"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="h-[1px] bg-white/10 my-2" />

                <div className="grid grid-cols-1 gap-2">
                  <button
                    onClick={() => {
                      // 直接喺當前視窗轉去 Remote 模式
                      const url = new URL(window.location.href);
                      url.searchParams.set('mode', 'remote');
                      //url.searchParams.set('room', roomId); // 傳埋 Room ID 過去
                      window.location.href = url.toString();
                    }}
                    className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-center gap-3 transition-all active:scale-95"
                  >
                    <span className="text-xl">📱</span>
                    <div className="text-left">
                      <p className="text-xs font-bold">Switch to Remote</p>
                      <p className="text-[9px] text-white/40 uppercase">Turn THIS device into a sensor</p>
                    </div>
                  </button>

                  {/* 💡 進階建議：如果你想手機掃 Code，可以加呢段 */}
                  <div className="p-3 bg-violet-600/10 border border-violet-500/20 rounded-xl">
                    <p className="text-[9px] text-violet-400 font-black uppercase mb-2 text-center">Quick Connect for Phone</p>

                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(
                          window.location.origin + "?mode=remote&room=" + roomId
                        )}`}
                        alt="QR Code"
                        className="w-32 h-32 block mx-auto"
                      />
  
                    <div className="mt-4 text-center">
                      <p className="text-[9px] text-gray-400 uppercase mt-2 font-bold">
                        Scan with Right-Side Phone
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg">
                  {isRemoteConnected ? (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-green-400 font-medium">Remote Linked</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                      <span className="text-xs text-yellow-500 font-medium italic">Waiting for Remote...</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Countdown Settings */}
            {!settings.randomTime && (
              <div className="mb-4 mt-4">
                <label className="block text-sm text-white/60 mb-1">Countdown time (seconds)</label>
                <input
                  type="number" min={1} value={settingsInput.countdownTime}
                  onChange={(e) => setSettingsInput((p) => ({ ...p, countdownTime: e.target.value }))}
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            )}

            <div className="mb-3 flex items-center gap-3">
              <input
                type="checkbox" id="randomTime" checked={settings.randomTime}
                onChange={(e) => setSettings((p) => ({ ...p, randomTime: e.target.checked }))}
                className="w-4 h-4 accent-violet-500"
              />
              <label htmlFor="randomTime" className="text-sm">Random countdown</label>
            </div>

            {settings.randomTime && (
              <div className="mb-4 flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-white/50 mb-1">Min (s)</label>
                  <input
                    type="number" value={settingsInput.randomMin}
                    onChange={(e) => setSettingsInput((p) => ({ ...p, randomMin: e.target.value }))}
                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-white/50 mb-1">Max (s)</label>
                  <input
                    type="number" value={settingsInput.randomMax}
                    onChange={(e) => setSettingsInput((p) => ({ ...p, randomMax: e.target.value }))}
                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                  />
                </div>
              </div>
            )}

            <div className="mb-4 flex items-center gap-3">
              <input
                type="checkbox" id="hideTimer" checked={settings.hideTimer}
                onChange={(e) => setSettings((p) => ({ ...p, hideTimer: e.target.checked }))}
                className="w-4 h-4 accent-violet-500"
              />
              <label htmlFor="hideTimer" className="text-sm">Hide timer</label>
            </div>

            <div className="mb-3 flex items-center gap-3">
              <input
                type="checkbox" id="autoRestart" checked={settings.autoRestart}
                onChange={(e) => setSettings((p) => ({ ...p, autoRestart: e.target.checked }))}
                className="w-4 h-4 accent-violet-500"
              />
              <label htmlFor="autoRestart" className="text-sm">Auto restart</label>
            </div>

            {settings.autoRestart && (
              <div className="mb-4">
                <label className="block text-sm text-white/60 mb-1">Restart delay (seconds)</label>
                <input
                  type="number" min={1} value={settingsInput.restartDelay}
                  onChange={(e) => setSettingsInput((p) => ({ ...p, restartDelay: e.target.value }))}
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none"
                />
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button onClick={handleSaveSettings} className="flex-1 bg-violet-600 rounded-lg py-2 text-sm font-medium">Save</button>
              <button onClick={() => setShowSettings(false)} className="flex-1 bg-white/10 rounded-lg py-2 text-sm font-medium">Cancel</button>
            </div>
          </div>  
        </div>
      )}

      {/* Game Area */}
      <div className="flex-1 flex relative overflow-hidden">
        
        {mode === "advanced" ? (
          /* ---------------------------------------------------------
             ADVANCED MODE: 單一全螢幕大掣 (作為左邊 Sensor)
          --------------------------------------------------------- */
          <div
            onPointerDown={(e) => { 
              e.preventDefault();
              if(leftActive && gameState === "reaction") handleSensorHit('left'); 
            }}
            className={`flex-1 flex items-center justify-center transition-colors duration-75 cursor-pointer relative overflow-hidden ${
              leftActive && gameState === "reaction" 
                ? "bg-white"  // 閃燈時變全白
                : "bg-gray-950" // 平時深色
            }`}
          >
            {/* 中央顯示區域：包含倒數同結果 */}
            {leftActive && gameState === "reaction" ? (
              <div className="flex flex-col items-center animate-pulse">
                <span className="text-black font-black text-7xl italic tracking-tighter">HIT!</span>
                <span className="text-black/40 text-[10px] font-bold mt-4 uppercase tracking-[0.3em]">Touch Screen</span>
              </div>
            ) : (
              /* 2. 非閃燈狀態 */
              <div className="flex flex-col items-center">
                
                {/* A. 倒數中 */}
                {gameState === "countdown" && (
                  <div className="text-center">
                    <div className="text-white/20 text-[10px] font-bold uppercase tracking-[0.4em] mb-4">Ready...</div>
                    <div className="font-black tabular-nums text-white text-7xl drop-shadow-[0_0_30px_rgba(139,92,246,0.4)]">
                      {settings.hideTimer ? "..." : formatTime(totalCs)}
                    </div>
                  </div>
                )}

                {/* B. 顯示結果 (反應時間) */}
                {gameState === "waiting_restart" && (
                  <div className="flex flex-col items-center animate-fade-in">
                    <div className="text-8xl font-black text-yellow-400 tabular-nums tracking-tighter">
                      {reactionTime?.toFixed(3)}s
                    </div>
                    <div className={`text-xl font-black uppercase mt-2 tracking-[0.2em] ${getGrade(reactionTime || 0).color}`}>
                      {getGrade(reactionTime || 0).label}
                    </div>
                    {settings.autoRestart && (
                      <p className="text-white/20 text-[10px] mt-8 uppercase tracking-widest font-bold">
                        Next in {restartCountdown}s
                      </p>
                    )}
                  </div>
                )}

                {/* C. 平時等待狀態 */}
                {(gameState === "idle" || (gameState === "reaction" && !leftActive)) && (
                  <div className="text-center opacity-30">
                    <div className="w-16 h-16 border border-violet-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
                      <div className="w-8 h-8 bg-violet-500 rounded-full blur-xl animate-pulse" />
                    </div>
                    <p className="text-white font-bold tracking-[0.4em] text-[10px] uppercase">
                      {gameState === "reaction" ? "Waiting for Remote" : "Master Sensor Active"}
                    </p>
                    <p className="text-white/50 text-[9px] mt-2 font-mono uppercase tracking-tighter">Room: {roomId}</p>
                  </div>
                )}
              </div>
            )}

            {/* 狀態標籤 (細細個喺角落，唔會遮位) */}
            <div className="absolute top-6 left-6 flex items-center gap-2 opacity-40">
              <div className={`w-2 h-2 rounded-full ${isRemoteConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-[10px] font-bold text-white uppercase tracking-widest">Left Side</span>
            </div>
          </div>
        ) : (
          /* ---------------------------------------------------------
             BASIC MODE: 保持原本左右分開 (單機玩)
          --------------------------------------------------------- */
          <>
            {/* Left Block */}
            <div className="flex-1 flex flex-col transition-all relative overflow-hidden bg-gray-900/30">
              
              {/* 6 區模式橫向分隔線 (只有在沒亮起時顯示，保持畫面乾淨) */}
              {settings.directionMode === 6 && (
                <div className="absolute inset-0 flex flex-col pointer-events-none opacity-20">
                  <div className="flex-1 border-b border-white" />
                  <div className="flex-1 border-b border-white" />
                  <div className="flex-1" />
                </div>
              )}

              <div className="flex-1 flex flex-col h-full relative z-20 min-h-0">
                {[0, 2, 4].map((idx) => {
                  // 核心修改：判斷這一格是不是目標，且現在是否處於顯示結果/反應的狀態
                  const { label, arrow } = getDirectionInfo(idx);

                  const isThisPointActive = gameState === "waiting_restart" && (
                    settings.directionMode === 6 
                      ? activeTarget === idx   // 6 區模式：精準亮起那一格 (0, 2, 或 4)
                      : leftActive             // 2 區模式：只要左邊中獎，0, 2, 4 三格全亮
                  );

                  return (
                    <div 
                      key={idx} 
                      className={`flex-1 flex flex-col items-center justify-center transition-all duration-75 ${
                        isThisPointActive ? "bg-sky-400 scale-[1.02] z-10" : "bg-transparent"
                      }`}
                    >
                      <div className={`flex flex-col items-center w-full transition-all duration-75 ${
                        isThisPointActive ? 'animate-bounce text-white' : 'text-white/20'
                      } ${settings.directionMode === 2 && idx !== 2 ? 'hidden' : ''}`}>
                        {/* 2 區模式顯示中間 (idx 3)，畫面最平衡 */}
                        {settings.directionMode === 6 && (
                          <span className="text-2xl leading-none mb-1 font-light">{arrow}</span>
                        )}
                        {/* 文字 */}
                        <span className="font-black text-2xl tracking-tighter">
                          {settings.directionMode === 6 ? label : "← LEFT"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Divider & HUD */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              {/* 中間分界線 */}
              <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />

              {/* HUD 內容 - 只保留倒數 */}
              <div className="relative flex flex-col items-center">
                
                {/* 倒數計時器 (Countdown) */}
                {gameState === "countdown" && (
                  <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                    <div className="text-white/20 text-[10px] font-bold uppercase tracking-[0.4em] mb-4">
                      Ready...
                    </div>
                    <div className="font-black tabular-nums text-white text-5xl drop-shadow-[0_0_30px_rgba(139,92,246,0.4)] tracking-tighter">
                      {settings.hideTimer ? "..." : formatTime(totalCs)}
                    </div>
                  </div>
                )}

                {/* 2. 反應階段 (Reaction) —— 呢度可以選擇留空，或者只係顯示一個簡單嘅 "GO!" */}
                {gameState === "reaction" && (
                  <div className="animate-pulse">
                    <div className="text-white/10 text-[10px] font-bold uppercase tracking-[1em]">
                      Action
                    </div>
                  </div>
                )}

                {/* 3. 閒置狀態 (Idle) */}
                {gameState === "idle" && (
                  <div className="opacity-10">
                    <div className="w-1 h-12 bg-white/50 rounded-full" />
                  </div>
                )}

                {/* ✅ 2. 只有在 Basic Mode 且等待重啟時顯示 (NEXT IN 03s) */}
                {gameState === "waiting_restart" && settings.autoRestart && (
                  <div className="flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {/* 紫色漸變發光文字 */}
                    <div className="text-white-400 text-[10px] font-black uppercase tracking-[0.3em] mb-1">
                      Next Round In
                    </div>
                    
                    {/* 倒數數字 */}
                    <div className="flex items-baseline gap-1">
                      <span className="font-black tabular-nums text-white text-6xl italic drop-shadow-[0_0_20px_rgba(139,92,246,0.5)]">
                        {restartCountdown}
                      </span>
                      <span className="text-white/40 font-bold text-sm uppercase">s</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Block */}
            <div className="flex-1 flex flex-col transition-all duration-75 relative overflow-hidden bg-gray-900/30">
              
              {/* 6 區模式橫向分隔線 (僅在未選中時微弱顯示) */}
              {settings.directionMode === 6 && (
                <div className="absolute inset-0 flex flex-col pointer-events-none opacity-20">
                  <div className="flex-1 border-b border-white" />
                  <div className="flex-1 border-b border-white" />
                  <div className="flex-1" />
                </div>
              )}

              <div className="flex-1 flex flex-col h-full relative z-20">
                {[1, 3, 5].map((idx) => {
                  // 1. 獲取當前格子的文字與箭頭
                  const { label, arrow } = getDirectionInfo(idx);

                  // 2. 判斷亮起邏輯
                  const isThisPointActive = gameState === "waiting_restart" && (
                    settings.directionMode === 6 
                      ? activeTarget === idx   // 6 區：精準選中
                      : rightActive            // 2 區：只要右邊中獎就全亮
                  );

                  return (
                    <div 
                      key={idx} 
                      className={`flex-1 flex flex-col items-center justify-center transition-all duration-75 ${
                        isThisPointActive ? "bg-sky-400" : "bg-transparent"
                      }`}
                    >
                      {/* 文字與箭頭容器 */}
                      <div className={`flex flex-col items-center w-full transition-all duration-75 ${
                        isThisPointActive ? 'animate-bounce text-white' : 'text-white/20'
                      } ${settings.directionMode === 2 && idx !== 3 ? 'hidden' : ''}`}>
                        
                        {/* 箭頭 (僅 6 區顯示) */}
                        {settings.directionMode === 6 && (
                          <span className="text-2xl leading-none mb-1 font-light">{arrow}</span>
                        )}
                        
                        {/* 方位文字 */}
                        <span className="font-black text-2xl tracking-tighter">
                          {settings.directionMode === 6 ? label : "RIGHT →"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Controls */}
      <footer className={`fixed bottom-0 left-0 right-0 z-40 bg-gray-950/80 backdrop-blur-xl border-t border-white/5 pb-[env(safe-area-inset-bottom)] transition-opacity duration-300 ${
          gameState === "countdown" ? 'opacity-20' : 'opacity-100'
        }`}
      >
        {/* 使用 h-20 並用 flex items-center 確保所有子元素垂直居中 */}
        <div className="flex items-center justify-between px-6 h-20 relative">
          
          {/* 1. 左邊區域 (固定寬度 w-24) */}
          <div className="w-24 flex items-center justify-start">
            {mode === 'basic' && gameState === "idle" && (
              <button
                onClick={() => setSettings(prev => ({ ...prev, directionMode: prev.directionMode === 2 ? 6 : 2 }))}
                className="flex flex-col items-center gap-1 group active:scale-90 transition-transform"
              >
                <div className="grid grid-cols-2 gap-0.5 p-1 border border-white/10 rounded bg-white/5">
                  {[...Array(settings.directionMode === 2 ? 2 : 6)].map((_, i) => (
                    <div key={i} className="w-1.5 h-1.5 bg-violet-500 rounded-sm" />
                  ))}
                </div>
                <span className="text-[9px] font-black text-white/40 group-active:text-violet-400 whitespace-nowrap">
                  {settings.directionMode} POINTS
                </span>
              </button>
            )}
          </div>

          {/* 2. 中間區域 (Start 按鈕) */}
          <div className="flex-1 flex items-center justify-center">
            {gameState === "idle" && (
              <div className="pointer-events-auto">
                {mode === "basic" ? (
                  <button 
                    onClick={startGame} 
                    className="flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white rounded-full font-black text-sm transition-all shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                  >
                    START
                  </button>
                ) : isRemoteConnected ? (
                  <button onClick={startGame} className="px-8 py-3 bg-white hover:bg-white/50 active:scale-95 text-black rounded-full font-bold text-sm uppercase tracking-widest transition-all shadow-lg whitespace-nowrap">
                    START TRAINING
                  </button>    
                ) : (
                  <div className="px-6 py-2 bg-black/40 border border-white/5 rounded-full backdrop-blur-sm">
                    <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Waiting for Remote</p>
                  </div>
                )}
              </div>
            )}

            {(gameState === "countdown" || gameState === "reaction") && (
              <button 
                onClick={handleRestart} 
                className="px-8 py-3 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full font-bold text-sm border border-white/10 text-white"
              >
                Cancel
              </button>
            )}

            {gameState === "waiting_restart" && (
              <button 
                onClick={settings.autoRestart ? handleRestart : startGame} 
                className={`px-8 py-3 rounded-full font-bold text-sm transition-all ${
                  settings.autoRestart ? 'bg-red-500/20 text-red-400 border border-red-500/20' : 'bg-violet-600 text-white shadow-lg'
                }`}
              >
                {settings.autoRestart ? 'Stop Training' : 'Play Again'}
              </button>
            )}
          </div>

          {/* 3. 右邊區域 (固定寬度 w-24，用來平衡視覺) */}
          <div className="w-24 flex items-center justify-end">
            {/* 這裡可以放 Setting 按鈕或保持空白 */}
          </div>

        </div>
      </footer>

      {/* 墊片：同樣要在內容最下面加個墊片，避免內容被 Footer 擋住 */}
      <div className="h-[calc(64px+env(safe-area-inset-bottom))]" />

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
      `}</style>
    </div> 
  );
}

