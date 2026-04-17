import { useEffect, useState, useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market, MarketsResponse } from "@/lib/api";
import { MarketCard } from "@/components/market-card";
import { Pagination } from "@/components/pagination";

type Status = "active" | "resolved" | "archived";
type Sort = "date" | "totalBets" | "participants";

function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<MarketsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("active");
  const [sort, setSort] = useState<Sort>("date");
  const [page, setPage] = useState(1);

  const loadMarkets = useCallback(
    async (silent = false) => {
      try {
        if (!silent) setIsLoading(true);
        setError(null);
        const result = await api.listMarkets(status, page, sort);
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load markets");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [status, page, sort],
  );

  // Initial + on filter change
  useEffect(() => {
    setPage(1);
  }, [status, sort]);

  useEffect(() => {
    loadMarkets();
  }, [loadMarkets]);

  // Real-time polling every 5s (silent refresh)
  useEffect(() => {
    const interval = setInterval(() => loadMarkets(true), 5000);
    return () => clearInterval(interval);
  }, [loadMarkets]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-br from-background to-muted/30">
        <div className="text-center max-w-md px-4">
          <img src="/logo.png" alt="Prophit" className="w-20 h-20 rounded-2xl mx-auto mb-6 shadow-lg" />
          <h1 className="text-5xl font-bold mb-3 bg-gradient-to-r from-violet-600 to-indigo-500 bg-clip-text text-transparent">
            Prophit
          </h1>
          <p className="text-muted-foreground mb-2 text-lg font-medium">
            Predict the future. Profit from being right.
          </p>
          <p className="text-muted-foreground mb-8 text-sm">
            Create prediction markets, place bets, and climb the leaderboard.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => navigate({ to: "/auth/login" })}
              className="px-6 py-3 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-500 text-white font-medium hover:opacity-90 transition-opacity shadow-md"
            >
              Login
            </button>
            <button
              onClick={() => navigate({ to: "/auth/register" })}
              className="px-6 py-3 rounded-lg border border-border font-medium hover:bg-accent transition-colors"
            >
              Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Markets</h1>
            <p className="text-muted-foreground mt-1">
              {data ? `${data.total} markets found` : "Loading..."}
            </p>
          </div>
          <button
            onClick={() => navigate({ to: "/markets/new" })}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
          >
            <span>+</span> Create Market
          </button>
        </div>

        {/* Filters & Sort Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Status filter */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {(["active", "resolved", "archived"] as Status[]).map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                  status === s
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-sm text-muted-foreground">Sort:</span>
            <div className="flex rounded-lg border border-border overflow-hidden">
              {([
                { value: "date", label: "Newest" },
                { value: "totalBets", label: "Volume" },
                { value: "participants", label: "Popular" },
              ] as { value: Sort; label: string }[]).map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    sort === s.value
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-muted-foreground"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Markets Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-64 rounded-xl border border-border bg-card animate-pulse"
              />
            ))}
          </div>
        ) : !data || data.markets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4">🔍</div>
            <h2 className="text-xl font-semibold mb-2">No {status} markets</h2>
            <p className="text-muted-foreground mb-6">
              {status === "active" && "Be the first to create a market!"}
              {status === "resolved" && "No markets have been resolved yet."}
              {status === "archived" && "No markets have been archived yet."}
            </p>
            {status === "active" && (
              <button
                onClick={() => navigate({ to: "/markets/new" })}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Create Market
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.markets.map((market) => (
                <MarketCard key={market.id} market={market} />
              ))}
            </div>

            <Pagination
              currentPage={page}
              totalPages={data.totalPages}
              onPageChange={setPage}
            />

            <p className="text-center text-xs text-muted-foreground mt-3">
              Page {page} of {data.totalPages} · {data.total} total markets · auto-refreshes every 5s
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")(  {
  component: DashboardPage,
});
