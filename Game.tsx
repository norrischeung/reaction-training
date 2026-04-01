import { useState, useEffect, useRef, useCallback } from "react";

type GameState = "idle" | "countdown" | "result" | "waiting_restart";

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
    setWinner(null);
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
        setGameState("result");
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

  const isLeft = winner === "left";
  const isRight = winner === "right";

  const leftActive = gameState === "result" && isLeft;
  const rightActive = gameState === "result" && isRight;

  return (
    <div className="h-[100dvh] w-screen flex flex-col bg-gray-950 text-white select-none overflow-hidden" style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 sm:py-4 z-10 relative">
        <h1 className="text-base sm:text-xl font-bold tracking-wide text-white/80">
          Reaction Training!
        </h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 rounded-full border border-white/20 hover:bg-white/10 transition-colors touch-manipulation"
        >
          Settings
        </button>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="absolute top-12 sm:top-16 right-2 sm:right-4 z-50 bg-gray-900 border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl w-[calc(100vw-1rem)] sm:w-72 max-w-xs">
          <h2 className="text-base font-semibold mb-4">Advanced Settings</h2>

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
      )}

      {/* Game Area */}
      <div className="flex-1 flex relative">
        {/* Left Block */}
        <div
          className={`flex-1 flex items-center justify-center transition-all duration-700 ${
            leftActive
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
            {gameState === "idle" && (
              <div className="text-center">
                {settings.randomTime && (
                  <div className="font-bold text-white/30 mb-1 tracking-wide" style={{ fontSize: "clamp(0.9rem, 3.5vw, 1.4rem)" }}>
                    {settings.randomMin}s ~ {settings.randomMax}s
                  </div>
                )}
                <div className="font-black text-white/20 tabular-nums mb-2" style={{ fontSize: "clamp(2.5rem, 10vw, 5rem)" }}>
                  {settings.randomTime ? "00:00" : formatTime(settings.countdownTime * 100)}
                </div>
                <p className="text-xs sm:text-sm text-white/30">Press Start to play</p>
              </div>
            )}

            {gameState === "countdown" && (
              <div className="text-center">
                {settings.randomTime && (
                  <div className="font-bold text-white/30 mb-1 tracking-wide" style={{ fontSize: "clamp(0.9rem, 3.5vw, 1.4rem)" }}>
                    {settings.randomMin}s ~ {settings.randomMax}s
                  </div>
                )}
                <div className="font-black tabular-nums text-white drop-shadow-[0_0_40px_rgba(139,92,246,0.8)]" style={{ fontSize: "clamp(2.5rem, 10vw, 5rem)" }}>
                  {settings.hideTimer ? (
                    <span className="text-white/20" style={{ fontSize: "clamp(1rem, 5vw, 2rem)" }}>...</span>
                  ) : (
                    formatTime(totalCs)
                  )}
                </div>
              </div>
            )}

            {gameState === "result" && (
              <div className="text-center animate-fade-in">
                <div
                  className={`font-black mb-2 ${
                    isLeft ? "text-violet-300" : "text-blue-300"
                  }`}
                  style={{ fontSize: "clamp(2rem, 8vw, 4rem)" }}
                >
                  {isLeft ? "←" : "→"}
                </div>
              </div>
            )}

            {gameState === "waiting_restart" && (
              <div className="text-center">
                <div className="text-xs sm:text-2xl text-white/50 mb-1">Restarting in</div>
                <div className="font-black text-white/80 tabular-nums" style={{ fontSize: "clamp(2.5rem, 10vw, 5rem)" }}>
                  {restartCountdown}
                </div>
                <div className="mt-2 text-xs sm:text-sm text-white/30 tracking-widest uppercase">
                  {settings.randomTime
                    ? "Next: Random"
                    : `Next: ${settings.countdownTime} second${settings.countdownTime !== 1 ? "s" : ""}`}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Block */}
        <div
          className={`flex-1 flex items-center justify-center transition-all duration-700 ${
            rightActive
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
      <div className="flex items-center justify-center gap-3 py-3 sm:py-6">
        {(gameState === "idle" || gameState === "result") && (
          <button
            onClick={startGame}
            className="px-8 sm:px-10 py-3 sm:py-3.5 bg-violet-600 hover:bg-violet-500 active:scale-95 transition-all rounded-full font-bold text-base sm:text-lg shadow-lg shadow-violet-900/50 touch-manipulation min-w-[120px]"
          >
            {gameState === "idle" ? "Start" : "Play Again"}
          </button>
        )}

        {gameState === "countdown" && (
          <button
            onClick={handleRestart}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full font-semibold text-sm sm:text-base touch-manipulation min-w-[100px]"
          >
            Cancel
          </button>
        )}

        {gameState === "waiting_restart" && (
          <button
            onClick={handleRestart}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full font-semibold text-sm sm:text-base touch-manipulation min-w-[100px]"
          >
            Cancel
          </button>
        )}

        {gameState === "result" && !settings.autoRestart && (
          <button
            onClick={handleRestart}
            className="px-8 py-3 bg-white/10 hover:bg-white/20 active:scale-95 transition-all rounded-full font-semibold text-sm sm:text-base touch-manipulation min-w-[100px]"
          >
            Restart
          </button>
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
