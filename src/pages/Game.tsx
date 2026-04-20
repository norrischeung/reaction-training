import { useState, useEffect, useRef, useCallback } from "react";
import { DataConnection, Peer } from "peerjs";

type GameState = "idle" | "countdown" | "result" | "reaction" | "waiting_restart" | "remote_control";
type mode = "basic" | "advanced";

interface Settings {
  countdownTime: number;
  autoRestart: boolean;
  restartDelay: number;
  hideTimer: boolean;
  randomTime: boolean;
  randomMin: number;
  randomMax: number;
}

export default function Game() {

  // Game states
  const [mode, setMode] = useState<mode>("basic");
  const [gameState, setGameState] = useState<GameState>("idle");
  const [totalCs, setTotalCs] = useState(500);
  const [winner, setWinner] = useState<"left" | "right" | null>(null);
  const [restartCountdown, setRestartCountdown] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    countdownTime: 5,
    autoRestart: false,
    restartDelay: 3,
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

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const restartRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (restartRef.current) clearInterval(restartRef.current);
  }, []);

  const startGame = useCallback(() => {
    clearTimers();
    setLeftActive(false);
    setRightActive(false);
    setWinner(null);
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
        const chosen = Math.random() < 0.5 ? "left" : "right";
        setWinner(chosen);

        // --- THE NEW MODE SWITCH ---
        if (mode === "advanced") {
          setStartTime(Date.now());
          setGameState("reaction");
          
          if (chosen === "left") {
            // Left = Host Device (This one)
            setLeftActive(true);
            setRightActive(false);
          } else {
            // Right = Remote Device (The other one)
            setLeftActive(false);
            setRightActive(true); // Keep Host dark

            // SEND SIGNAL to Remote
            if (connection && connection.open) {
              connection.send({ type: 'SIGNAL_FLASH' });
            }   
          } 
        } else {
          // BASIC MODE: Standard local behavior
          setLeftActive(chosen === "left");
          setRightActive(chosen === "right");

          setGameState("waiting_restart");
          if (settings.autoRestart) {
            triggerAutoRestart();
          }
        }
      }
    }, 10);
  }, [settings, clearTimers]);

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

  useEffect(() => {
    if (gameState === "result" && settings.autoRestart) {
      const t = setTimeout(() => triggerAutoRestart(), 800);
      return () => clearTimeout(t);
    }
  }, [gameState, settings.autoRestart, triggerAutoRestart]);

  useEffect(() => {
    return () => clearTimers();
  }, [clearTimers]);

  const handleRestart = () => {
    clearTimers();
    setWinner(null);
    setLeftActive(false);
    setRightActive(false);
    setStartTime(0);
    setRestartCountdown(0);
    setGameState("idle");
    setTotalCs(settings.countdownTime * 100);
  };

  const formatTime = (cs: number) => {
    const secs = Math.floor(cs / 100);
    const cents = cs % 100;
    return `${String(secs).padStart(2, "0")}:${String(cents).padStart(2, "0")}`;
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

  //Remote Receiver
  const [myPeerId, setMyPeerId] = useState<string>("");
  const [remotePeerId, setRemotePeerId] = useState<string>("");   // 儲存你打入去嗰串 ID
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);

  // 只保留接收連線的 useEffect
  useEffect(() => {
    if (peerRef.current) return;

    const peer = new Peer({
        secure: true,
        config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              { urls: "stun:stun2.l.google.com:19302" },
              { urls: "stun:stun3.l.google.com:19302" },
              { urls: "stun:stun4.l.google.com:19302" },
            ],
            // 解決 negotiation-failed 嘅關鍵：強制使用統一協定
            sdpSemantics: "unified-plan" 
        },
        debug: 3, // 喺 Console 睇到最詳細嘅連線過程
    });

    peer.on('open', (id) => {
      console.log('✅ My Peer ID is: ' + id);
      setMyPeerId(id);
    });

    peer.on('connection', (conn) => {
      setConnection(conn);
      console.log("👾 Remote joined!");

      conn.on('open', () => {
        console.log("📡 Sending ACK to phone...");
        conn.send("SERVER_READY"); 
        conn.send({ type: "SET_REMOTE_MODE" });
      });

      conn.on('data', (data: any) => {
        if (data === 'HIT' || data.type === 'HIT') {
          console.log("🎯 Remote HIT received!");

          const receivedAt = Date.now(); // Capture the exact moment the signal arrived
          
          setGameState(prev => {
            // Only stop if the game is currently in the "reaction" phase
            if (prev === "reaction") {
              stopReactionTimer(receivedAt);
            }
            return prev;
          });
        }
      });
    });

    peer.on('disconnected', () => {
      console.log("❌ Connection lost. Reconnecting...");
      peer.reconnect(); // 呢句可以幫你攞返原本個 ID 並連返 Server
    });

    peer.on('error', (err) => {
      if (err.type === 'network') {
        // 💡 Localhost 常用大絕：如果斷網，等 2 秒再連
        setTimeout(() => {
          if (!peer.destroyed) peer.reconnect();
        }, 2000);
      }
    });

    peerRef.current = peer;
  }, []);

  const connectToPeer = (id: string) => {
    if (!peerRef.current || !id) return;

    console.log("正在連線至:", id);
    const conn = peerRef.current.connect(id);

    conn.on('open', () => {
      setConnection(conn);
      console.log("✅ 成功連線到對方裝置！");
    });

    conn.on('error', (err: any) => {
      console.error("❌ 連線出錯:", err);
      alert("連線失敗，請檢查 ID 是否正確");
    });
  };

  // 3. 副機端：發送 HIT 訊號
  const sendHit = () => {
    if (connection) {
      connection.send("HIT");
    }
  };

  // Copy ID
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (navigator.clipboard && myPeerId) {
      try {
        navigator.clipboard.writeText(myPeerId);
        setCopied(true);
        alert("ID copied!");
      } catch (err) {
        console.error("Failed to copy!", err);
      }
    } else {
      //  fallback 方案：如果 clipboard 唔存在
      console.log("Clipboard API not available");
      alert("Your ID: " + myPeerId);
    }
  };

  // 1. We need these states to track the millisecond-perfect timing
  // Track the actual numbers
  const [startTime, setStartTime] = useState<number>(0);
  const [reactionTime, setReactionTime] = useState<number | null>(null);
  const [leftActive, setLeftActive] = useState(false);
  const [rightActive, setRightActive] = useState(false);


  // STEP 3: This runs the moment the 3, 2, 1 countdown ends
  const startReactionTimer = () => {
    setStartTime(Date.now()); // Record the "Go!" moment in ms
    setGameState("result");   // Or whatever your 'playing' state is named
  };


  
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
      setWinner(null);

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

  const stopTimerRef = useRef(stopReactionTimer);
  useEffect(() => {
    stopTimerRef.current = stopReactionTimer;
  });


  //Effect starts the reaction timer when the countdown ends
  const getGrade = (time: number) => {
    if (time < 0.30) return { label: "ELITE ⚡", color: "text-yellow-400" };
    if (time < 0.50) return { label: "PRO 🏸", color: "text-green-400" };
    if (time < 0.80) return { label: "GOOD 👍", color: "text-blue-400" };
    return { label: "KEEP TRAINING!", color: "text-gray-400" };
  };


  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-gray-950 text-white select-none overflow-hidden" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
      {/* Remote Control Overlay */}
      {gameState === "remote_control" && (
        <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center p-6">
          <div className="text-white/40 mb-8 text-center">
            <p className="text-xs uppercase tracking-widest font-bold text-violet-400">CONNECTED AS REMOTE</p>
          </div>
          
          <button
            onPointerDown={(e) => {
              e.preventDefault();
              sendHit();
            }}
            className="w-64 h-64 bg-violet-600 active:bg-violet-400 active:scale-95 transition-all rounded-full shadow-[0_0_80px_rgba(139,92,246,0.6)] flex items-center justify-center border-8 border-white/20"
          >
            <span className="text-4xl font-black text-white italic">HIT!</span>
          </button>

          <button 
            onClick={() => window.location.reload()} // 最暴力嘅斷開方法：直接 Reload
            className="mt-12 px-6 py-2 bg-white/5 rounded-full text-white/40 text-[10px] font-bold uppercase tracking-widest"
          >
            Exit Remote Mode
          </button>
        </div>
      )}
   
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 z-10 relative bg-gray-950/50 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black tracking-tighter text-white">
            REACTION<span className="text-violet-500">PRO</span>
          </h1>
          {/* 顯示當前模式的小標籤 */}
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-white/5 text-white/40 uppercase tracking-widest">
            {mode}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* 只有在開發/測試時才顯示的隱形按鈕，或者縮小它 */}
          <button 
            onClick={() => stopReactionTimer()}
            className="p-2 text-[10px] text-white/10 hover:text-white/40 transition-colors uppercase font-bold"
          >
            Mock Hit
          </button>
          
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all active:scale-95"
          >
            <span className="text-xs font-bold uppercase tracking-wider">Settings</span>
            {/* 簡單的齒輪 Icon 裝飾 */}
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div 
          className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6"
          onClick={() => setShowSettings(false)} // This closes the panel
        >
          <div 
            className="absolute top-12 sm:top-16 right-2 sm:right-4 z-50 
                      bg-gray-900/95 backdrop-blur-xl border border-white/10 
                      rounded-2xl p-4 sm:p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] 
                      w-[calc(100vw-1rem)] sm:w-80 max-w-xs
                      /* These two lines fix the scrolling */
                      max-h-[80vh] overflow-y-auto custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between mb-6 px-1">
              <h2 className="text-lg font-bold text-white/95 whitespace-nowrap tracking-tight">Advanced Settings</h2>
                
                {/* Bluetooth Quick Toggle */}
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
            <div className="mb-6">
              <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-3 block">
                Training Mode
              </label>
              <div className="p-1 bg-black/40 rounded-xl flex gap-1">
                <button
                  onClick={() => { 
                    handleRestart(); 
                    setMode("basic"); 
                  }}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    mode === "basic" ? "bg-white/10 text-white shadow-xl" : "text-white/30 hover:text-white/60"
                  }`}
                >
                  BASIC
                </button>
                <button
                  onClick={() => { 
                    handleRestart(); 
                    setMode("advanced"); 
                  }}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all ${
                    mode === "advanced" ? "bg-violet-600 text-white shadow-lg shadow-violet-900/20" : "text-white/30 hover:text-white/60"
                  }`}
                >
                  ADVANCED
                </button>
              </div>
            </div>

            {/* 模式切換之後... */}
            {mode === "advanced" && (
              <div className="mt-6 p-4 bg-white/5 rounded-2xl border border-white/10 space-y-4">
                <h3 className="text-xs font-bold text-violet-400 uppercase tracking-widest">Multi-Device (Advanced)</h3>
                
                {/* 顯示本地 ID，俾另一部機連入嚟 */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/40">This Device ID (Share this)</span>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-black/40 px-3 py-2 rounded-lg font-mono text-sm text-white truncate">
                      {myPeerId || "Generating..."}
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

                {/* 連線至 Host 的輸入框 */}
                {!connection ? (
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-white/40">Connect to another device</span>
                    <input 
                      type="text" 
                      placeholder="Paste Host ID here..."
                      value={remotePeerId}
                      onChange={(e) => setRemotePeerId(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 transition"
                    />
                    <button 
                      onClick={() => connectToPeer(remotePeerId)}
                      className="w-full bg-violet-600 hover:bg-violet-500 py-2 rounded-lg font-bold text-sm transition"
                    >
                      Connect as Remote
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-green-400 font-medium">Device Connected</span>
                    </div>
                    <button 
                      onClick={() => setConnection(null)}
                      className="text-[10px] text-red-400 hover:underline"
                    >
                      Disconnect
                    </button>
                  </div>
                )}
              </div>
            )}
            

            {/* Countdown time — hidden when random time is on */}
            {!settings.randomTime && (
              <div className="mb-4">
                <label className="block text-sm text-white/60 mb-1">
                  Countdown time (seconds)
                </label>
                <input
                  type="number"
                  min={1}
                  value={settingsInput.countdownTime}
                  onChange={(e) =>
                    setSettingsInput((p) => ({ ...p, countdownTime: e.target.value }))
                  }
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                />
              </div>
            )}

            {/* Random time toggle */}
            <div className="mb-3 flex items-center gap-3">
              <input
                type="checkbox"
                id="randomTime"
                checked={settings.randomTime}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, randomTime: e.target.checked }))
                }
                className="w-4 h-4 accent-violet-500 cursor-pointer"
              />
              <label htmlFor="randomTime" className="text-sm cursor-pointer">
                Random countdown time
              </label>
            </div>

            {/* Random range fields */}
            {settings.randomTime && (
              <div className="mb-4 flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-white/50 mb-1">Min (s)</label>
                  <input
                    type="number"
                    min={1}
                    value={settingsInput.randomMin}
                    onChange={(e) =>
                      setSettingsInput((p) => ({ ...p, randomMin: e.target.value }))
                    }
                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-white/50 mb-1">Max (s)</label>
                  <input
                    type="number"
                    min={1}
                    value={settingsInput.randomMax}
                    onChange={(e) =>
                      setSettingsInput((p) => ({ ...p, randomMax: e.target.value }))
                    }
                    className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                  />
                </div>
              </div>
            )}

            {/* Hide timer toggle */}
            <div className="mb-4 flex items-center gap-3">
              <input
                type="checkbox"
                id="hideTimer"
                checked={settings.hideTimer}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, hideTimer: e.target.checked }))
                }
                className="w-4 h-4 accent-violet-500 cursor-pointer"
              />
              <label htmlFor="hideTimer" className="text-sm cursor-pointer">
                Hide timer from players
              </label>
            </div>

            {/* Auto restart toggle */}
            <div className="mb-3 flex items-center gap-3">
              <input
                type="checkbox"
                id="autoRestart"
                checked={settings.autoRestart}
                onChange={(e) =>
                  setSettings((p) => ({ ...p, autoRestart: e.target.checked }))
                }
                className="w-4 h-4 accent-violet-500 cursor-pointer"
              />
              <label htmlFor="autoRestart" className="text-sm cursor-pointer">
                Auto restart
              </label>
            </div>

            {settings.autoRestart && (
              <div className="mb-4">
                <label className="block text-sm text-white/60 mb-1">
                  Restart delay (seconds)
                </label>
                <input
                  type="number"
                  min={1}
                  value={settingsInput.restartDelay}
                  onChange={(e) =>
                    setSettingsInput((p) => ({ ...p, restartDelay: e.target.value }))
                  }
                  className="w-full bg-gray-800 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white/30"
                />
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleSaveSettings}
                className="flex-1 bg-violet-600 hover:bg-violet-500 transition-colors rounded-lg py-2 text-sm font-medium"
              >
                Save
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 transition-colors rounded-lg py-2 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          </div>  
          
        </div>
      )}

      {/* Game Area */}
      <div className="flex-1 flex relative">
        {/* Left Block */}
        <div
          onClick={() => { if(leftActive) handleSensorHit('left'); }}
          className={`flex-1 flex items-center justify-center transition-all duration-700 ${
            (leftActive && (gameState === "reaction" || gameState === "result"))
              ? "bg-gradient-to-br from-violet-600 to-violet-900 scale-[1.02] z-20"
              : "bg-gray-900/30 scale-[1.0]"
          }`}
        >
          <div className="text-center">
            {leftActive && (
              <div className="animate-bounce font-black text-white drop-shadow-2xl" style={{ fontSize: "clamp(1.5rem, 6vw, 3.5rem)" }}>
                LEFT
              </div>
            )}
            {!leftActive && (
              <div className="font-bold text-white/10" style={{ fontSize: "clamp(1.2rem, 5vw, 2.5rem)" }}>
                Master Side
              </div>
            )}
          </div>
        </div>

        {/* Divider + Center Overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          {/* Vertical divider */}
          <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />

          {/* Center content */}
          <div className="relative flex-1 flex flex-col items-center justify-center gap-4 min-h-0">
            
            {/* PHASE 1: COUNTDOWN (3...2...1) */}
            {gameState === "countdown" && (
              <div className="text-center">
                <div className="font-black tabular-nums text-white drop-shadow-[0_0_40px_rgba(139,92,246,0.8)] text-6xl">
                  {settings.hideTimer ? "..." : formatTime(totalCs)}
                </div>
              </div>
            )}

            {/* PHASE 2: REACTION (The moment they should run) */}
            {gameState === "reaction" && (
              <div className="text-center animate-pulse">
                <div className="text-xl font-black text-white italic tracking-widest">GO! GO!</div>
              </div>
            )}

            {/* PHASE 3: WAITING / RESULT (Show the score) */}
            {gameState === "waiting_restart" && (
              <div className="text-center animate-fade-in">
                {mode === "advanced" ? (
                  // ADVANCED: Show big reaction time
                  <>
                    <div className="text-7xl font-black text-yellow-400 tabular-nums">
                      {reactionTime !== null ? reactionTime.toFixed(3) : "0.000"}s
                    </div>
                    <div className={`text-xl font-bold uppercase mt-2 ${reactionTime !== null ? getGrade(reactionTime).color : ""}`}>
                      {reactionTime !== null ? getGrade(reactionTime).label : ""}
                    </div>
                  </>
                ) : (
                  // BASIC: Just show a simple "GO!" or the direction arrow
                  <div className={`text-9xl font-black transition-all duration-300 ${
                    winner === "left" 
                      ? "text-violet-400 drop-shadow-[0_0_50px_rgba(167,139,250,0.8)]" 
                      : "text-blue-400 drop-shadow-[0_0_50px_rgba(96,165,250,0.8)]"
                  }`}>
                    {winner === "left" ? "←" : "→"}
                  </div>
                )}

                {settings.autoRestart && (
                  <div className="mt-6 text-white/30 text-sm font-medium animate-pulse">
                    Next round in {restartCountdown}s...
                  </div>
                )}
              </div>
            )}
          </div> 
        </div> 

        {/* Right Block */}
        {/* Right Block (Master side) */}
        <div
          onClick={() => { 
            // 💡 如果係 Advanced 且連咗線，呢度唔比撳，要等電話傳返嚟
            if (rightActive && (!connection || mode === "basic")) {
              handleSensorHit('right');
            }
          }}
          className={`flex-1 flex items-center justify-center transition-all duration-700 ${
            (rightActive && (gameState === "reaction" || gameState === "result"))
              ? mode === "advanced" && connection
                ? "bg-white/5 scale-[0.98] border-l border-white/10" // 連咗線後：變虛
                : "bg-gradient-to-bl from-blue-600 to-blue-900 scale-[1.01]" // 未連線：原本藍色
              : leftActive
                ? "bg-gray-900/50 scale-[0.99]"
                : "bg-gray-900/30"
          }`}
        >
          <div className="text-center">
            {rightActive && (
              <div className="flex flex-col items-center gap-4">
                {mode === "advanced" && connection ? (
                  <>
                    <div className="w-4 h-4 bg-blue-500 rounded-full animate-ping" />
                    <div className="font-black text-blue-400 italic tracking-tighter" style={{ fontSize: "clamp(1rem, 4vw, 2rem)" }}>
                      SIGNAL SENT TO REMOTE
                    </div>
                  </>
                ) : (
                  <div className="animate-bounce font-black text-white drop-shadow-2xl" style={{ fontSize: "clamp(1.5rem, 6vw, 3.5rem)" }}>
                    RIGHT
                  </div>
                )}
              </div>
            )}
            {!rightActive && (
              <div className="font-bold text-white/5" style={{ fontSize: "clamp(1.2rem, 5vw, 2.5rem)" }}>
                {mode === "advanced" && connection ? "REMOTE SIDE" : "RIGHT"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-3 py-6">
        
        {/* 1. 遊戲未開始：顯示 Start */}
        {gameState === "idle" && (!(mode === "advanced" && connection)) && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-gray-950/80">
            <button 
              onClick={startGame}
              className="w-32 h-32 bg-violet-600 rounded-full font-black text-xl shadow-2xl active:scale-95 transition-all"
            >
              START
            </button>
          </div>
        )}

        {/* 如果連咗線，中間顯示一個專屬嘅 Ready Button */}
        {gameState === "idle" && mode === "advanced" && connection && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center">
            <button 
              onClick={startGame}
              className="px-10 py-5 bg-white text-black font-black italic rounded-2xl shadow-2xl active:scale-95 transition-all"
            >
              READY? GO!
            </button>
          </div>
        )}

        {/* 2. 訓練中：顯示 Cancel */}
        {(gameState === "countdown" || gameState === "reaction") && (
          <button 
            onClick={handleRestart} 
            className="h-12 min-w-[140px] px-8 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full font-bold text-sm sm:text-base border border-white/10 touch-manipulation"
          >
            Cancel
          </button>
        )}

        {/* 3. 顯示結果時 (waiting_restart) */}
        {gameState === "waiting_restart" && (
          <div className="flex flex-col items-center gap-4">
            {settings.autoRestart ? (
              // 自動模式：顯示倒數提示同 Cancel
              <>
                <div className="text-white/60 text-sm font-medium animate-pulse">
                  Next round starting soon...
                </div>
                <button
                  onClick={handleRestart}
                  className="h-12 min-w-[140px] px-8 bg-red-500/20 text-red-400 hover:bg-red-500/30 active:scale-95 transition-all rounded-full font-bold text-sm sm:text-base border border-red-500/20 touch-manipulation"
                >  
                  Stop Training
                </button>
              </>
            ) : (
              // 手動模式：只顯示一個 Play Again 掣 (紫色)
              <button
                onClick={startGame}
                className="h-12 min-w-[140px] px-8 bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all rounded-full font-bold text-sm sm:text-base shadow-lg shadow-violet-900/40 touch-manipulation"
              >
                Play Again
              </button>
            )}
          </div>
        )}
      </div> 

      <style>{`
        @keyframes countdown-pop {
          0% { transform: scale(1.4); opacity: 0.3; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.4s ease-out forwards;
        }
        .animate-ping-once {
          animation: countdown-pop 0.4s ease-out forwards;
        }
      `}</style>
    
    </div> 
  );
}

