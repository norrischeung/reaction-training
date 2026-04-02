import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Game from "./pages/Game";
import Remote from "./pages/Remote";

// 1. 初始化 Query Client
const queryClient = new QueryClient();

export default function App() {
  // 2. 檢查 URL 參數
  // 記得喺手機打開：your-app.vercel.app?mode=remote
  const params = new URLSearchParams(window.location.search);
  const isRemote = params.get("mode") === "remote";

  return (
    <QueryClientProvider client={queryClient}>
      {/* 3. 根據參數決定顯示邊個頁面 */}
      {isRemote ? <Remote /> : <Game />}
    </QueryClientProvider>
  );
}