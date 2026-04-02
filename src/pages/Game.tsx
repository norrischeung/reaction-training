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

        //ACTIVATE the specific side highlights
        if (chosen === "left") {
          setLeftActive(true);
          setRightActive(false);
        } else {
          setRightActive(true);
          setLeftActive(false);
        }

        // --- THE NEW MODE SWITCH ---
        if (mode === "advanced") {
          setStartTime(Date.now());
          setGameState("reaction");
        } else {
          // BASIC MODE: Just show the direction and wait to restart
          setGameState("waiting_restart");
          
          // Trigger auto-restart if enabled
          if (settings.autoRestart) {
            // You can call your triggerAutoRestart() here 
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
  // Only trigger if the game is active and the correct side was hit
    if (gameState === "countdown") {
      if ((side === 'left' && leftActive) || (side === 'right' && rightActive)) {
        console.log(`${side} sensor triggered!`);
        
        // Stop your timer logic here
        // For example, if your function is called stopTimer():
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
  const [targetPeerId, setTargetPeerId] = useState<string>("");
  const [connection, setConnection] = useState<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);

  useEffect(() => {
    // 1. 初始化 Peer (這會給你一個隨機 ID)
    const peer = new Peer({ debug: 2 });
    peerRef.current = peer;

    peer.on('open', (id) => setMyPeerId(id)); // Enhance: QR code 

    // 2. 監聽別人的連接
    peer.on('connection', (conn) => {
      setConnection(conn);
      console.log("👾 Remote device joined!");

      conn.on('data', (data) => {
        if (data === 'HIT') {
          // 使用 functional update 確保拎到最新 state
          setGameState(prev => {
            if (prev === "reaction") {
              stopTimerRef.current();
            }
            return prev;
          });
        }
      });
    });

    return () => peer.destroy();
  }, []);

  // 2. 副機端：主動連線到主機
  const connectToHost = () => {
    const cleanId = targetPeerId.trim();
    if (!peerRef.current || !cleanId) return;

    console.log("Connecting to:", cleanId);
    const conn = peerRef.current.connect(cleanId);

    // 監聽連線成功
    conn.on("open", () => {
      setConnection(conn);
      setGameState("remote_control"); // 只有連線成功才跳轉畫面
      alert("Connected!");
    });

    // 監聽錯誤 (例如 ID 不存在)
    conn.on("error", (err) => {
      alert("Connection failed: " + err.type);
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
    if (!myPeerId) return;
    
    // 複製到剪貼簿
    navigator.clipboard.writeText(myPeerId);
    
    // 顯示「已複製」狀態 2 秒
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 1. We need these states to track the millisecond-perfect timing
  // Track the actual numbers
  const [startTime, setStartTime] = useState<number>(0);
  const [reactionTime, setReactionTime] = useState<number>(0);
  const [leftActive, setLeftActive] = useState(false);
  const [rightActive, setRightActive] = useState(false);


  // STEP 3: This runs the moment the 3, 2, 1 countdown ends
  const startReactionTimer = () => {
    setStartTime(Date.now()); // Record the "Go!" moment in ms
    setGameState("result");   // Or whatever your 'playing' state is named
  };


  
  //Function for the Mock Button & Bluetooth
  const stopReactionTimer = () => {
    // 1. Only run if we are actually in the 'reaction' phase
    if (gameState === "reaction" && startTime) {
      const duration = (Date.now() - startTime) / 1000;
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
        <div className="absolute top-12 sm:top-16 right-2 sm:right-4 z-50 bg-gray-900 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl w-[calc(100vw-1rem)] sm:w-72 max-w-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white/90">Advanced Settings</h2>
            
            {/* Bluetooth Quick Toggle */}
            <button
              onClick={connectSensor}
              className={`p-2 rounded-lg transition-all duration-300 ${
                isConnected 
                  ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" 
                  : "bg-white/5 text-white/40 border border-white/10 hover:bg-white/10"
              }`}
              title={isConnected ? "Sensor Connected" : "Connect Sensor"}
            >
              <div className="flex items-center gap-2 text-xs font-bold">
                <span>{isConnected ? "CONNECTED" : "OFFLINE"}</span>
                <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-blue-400 animate-pulse" : "bg-gray-600"}`} />
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

          {/* Settings Panel 內部新增一個 Section */}
          <div className="mt-8 pt-6 border-t border-white/5">
            <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-4 block">
              Remote Wireless Control
            </label>
            
            <div className="space-y-4">
              {/* 顯示自己的 ID */}
              <div className="bg-black/40 p-3 rounded-xl">
                <p className="text-[10px] text-white/40 mb-1">Your Device ID (Host)</p>
                <div className="flex items-center justify-between gap-3">
                  <code className="text-sm font-mono font-bold text-violet-400 break-all">
                    {myPeerId || "Generating ID..."}
                  </code>
                  
                  <button
                    onClick={handleCopy}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                      copied 
                        ? "bg-green-500/20 text-green-400" 
                        : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              {/* 連線到另一台裝置 */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Enter Host ID"
                  value={targetPeerId}
                  onChange={(e) => setTargetPeerId(e.target.value)}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs focus:outline-none"
                />
                <button
                  onClick={connectToHost}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold transition-all"
                >
                  {connection ? "Connected ✅" : "Connect as Remote"}
                </button>
                {/* 狀態提示文字 */}
                {!connection && targetPeerId && (
                  <p className="text-[10px] text-white/20 text-center uppercase tracking-tighter">
                    Waiting for master to accept...
                  </p>
                )}
              </div>
              
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
              ? "bg-gradient-to-br from-violet-600 to-violet-900 scale-[1.01]"
              : rightActive
                ? "bg-gray-900/50 scale-[0.99]"
                : "bg-gray-900/30"
          }`}
        >
          <div className="text-center">
            {leftActive && (
              <div className="animate-bounce font-black text-white drop-shadow-2xl" style={{ fontSize: "clamp(1.5rem, 6vw, 3.5rem)" }}>
                LEFT
              </div>
            )}
            {!leftActive && (
              <div className="font-bold text-white/10" style={{ fontSize: "clamp(1.2rem, 5vw, 2.5rem)" }}>LEFT</div>
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
                      {reactionTime.toFixed(3)}s
                    </div>
                    <div className={`text-xl font-bold uppercase mt-2 ${getGrade(reactionTime).color}`}>
                      {getGrade(reactionTime).label}
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
        <div
          onClick={() => { if(rightActive) handleSensorHit('right'); }}
          className={`flex-1 flex items-center justify-center transition-all duration-700 ${
            (rightActive && (gameState === "reaction" || gameState === "result"))
              ? "bg-gradient-to-bl from-blue-600 to-blue-900 scale-[1.01]"
              : leftActive
                ? "bg-gray-900/50 scale-[0.99]"
                : "bg-gray-900/30"
          }`}
        >
          <div className="text-center">
            {rightActive && (
              <div className="animate-bounce font-black text-white drop-shadow-2xl" style={{ fontSize: "clamp(1.5rem, 6vw, 3.5rem)" }}>
                RIGHT
              </div>
            )}
            {!rightActive && (
              <div className="font-bold text-white/10" style={{ fontSize: "clamp(1.2rem, 5vw, 2.5rem)" }}>RIGHT</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="flex items-center justify-center gap-3 py-6">
        
        {/* 1. 遊戲未開始：顯示 Start */}
        {gameState === "idle" && (
          <button 
            onClick={startGame} 
            className="h-12 min-w-[140px] px-8 bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all rounded-full font-bold text-sm sm:text-base shadow-lg shadow-violet-900/40 touch-manipulation" 
          >
            Start Training
          </button>
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

      {/* Remote Control Overlay */}
      {gameState === "remote_control" && (
      <div className="fixed inset-0 z-[100] bg-gray-950 flex flex-col items-center justify-center p-6">
        <div className="text-white/40 mb-8 text-center">
          <p className="text-xs uppercase tracking-widest font-bold">Connected to Master</p>
          <p className="text-[10px] opacity-50">Tap anywhere to TRIGGER</p>
        </div>
        
        <button
          onPointerDown={sendHit} // 使用 PointerDown 反應更快
          className="w-full aspect-square max-w-[300px] bg-violet-600 active:bg-violet-400 active:scale-95 transition-all rounded-full shadow-[0_0_80px_rgba(139,92,246,0.3)] flex items-center justify-center border-8 border-white/10"
        >
          <span className="text-4xl font-black text-white italic">HIT!</span>
        </button>

        <button 
          onClick={() => setGameState("idle")}
          className="mt-12 text-white/20 text-xs font-bold uppercase tracking-widest hover:text-white/40"
        >
          Disconnect
        </button>
      </div>
    )}

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

