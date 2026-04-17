import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market } from "@/lib/api";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const CHART_COLORS = [
  "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#14b8a6",
];

function MarketDetailPage() {
  const { id } = useParams({ from: "/markets/$id" });
  const navigate = useNavigate();
  const { isAuthenticated, user, updateUser } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [isBetting, setIsBetting] = useState(false);
  // Admin resolve
  const [resolveOutcomeId, setResolveOutcomeId] = useState<number | null>(null);
  const [isResolving, setIsResolving] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showConfirm, setShowConfirm] = useState<"resolve" | "archive" | null>(null);
  // Similar markets
  const [similar, setSimilar] = useState<{ id: number; title: string; outcomesCount: number; totalMarketBets: number }[]>([]);

  const marketId = parseInt(id, 10);

  const loadMarket = useCallback(async (silent = false) => {
    try {
      if (!silent) setIsLoading(true);
      const data = await api.getMarket(marketId);
      setMarket(data);
      if (!selectedOutcomeId && data.outcomes.length > 0) {
        setSelectedOutcomeId(data.outcomes[0].id);
        setResolveOutcomeId(data.outcomes[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load market");
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [marketId, selectedOutcomeId]);

  useEffect(() => { loadMarket(); }, [marketId]);

  // Fetch similar markets once the market loads
  useEffect(() => {
    if (!market) return;
    api.getSimilarMarkets(marketId).then(({ similar: s }) => setSimilar(s)).catch(() => {});
  }, [market?.id]);

  // Real-time polling every 5s
  useEffect(() => {
    if (!market || market.status !== "active") return;
    const interval = setInterval(() => loadMarket(true), 5000);
    return () => clearInterval(interval);
  }, [loadMarket, market]);

  const handlePlaceBet = async () => {
    const amount = parseFloat(betAmount);
    if (!selectedOutcomeId) { setError("Please select an outcome"); return; }
    if (!betAmount || isNaN(amount) || amount <= 0) { setError("Enter a positive bet amount"); return; }
    if (user && amount > (user.balance ?? 0)) { setError(`Insufficient balance. Your balance: $${(user.balance ?? 0).toFixed(2)}`); return; }

    try {
      setIsBetting(true);
      setError(null);
      const result = await api.placeBet(marketId, selectedOutcomeId, amount);
      setBetAmount("");
      setSuccess(`Bet placed successfully! New balance: $${result.newBalance?.toFixed(2)}`);
      if (result.newBalance !== undefined && updateUser) {
        updateUser({ balance: result.newBalance });
      }
      await loadMarket(true);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setIsBetting(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveOutcomeId) return;
    try {
      setIsResolving(true);
      setError(null);
      await api.resolveMarket(marketId, resolveOutcomeId);
      setSuccess("Market resolved! Winnings distributed.");
      setShowConfirm(null);
      await loadMarket();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve market");
    } finally {
      setIsResolving(false);
    }
  };

  const handleArchive = async () => {
    try {
      setIsArchiving(true);
      setError(null);
      await api.archiveMarket(marketId);
      setSuccess("Market archived. Bets returned to users.");
      setShowConfirm(null);
      await loadMarket();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive market");
    } finally {
      setIsArchiving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please log in to view this market</p>
          <button
            onClick={() => navigate({ to: "/auth/login" })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="space-y-4 w-full max-w-3xl px-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-4">Market not found</p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Back to Markets
          </button>
        </div>
      </div>
    );
  }

  const chartData = market.outcomes.map((o) => ({
    name: o.title,
    value: o.totalBets > 0 ? o.totalBets : 0,
    odds: o.odds,
  }));
  const hasChartData = chartData.some((d) => d.value > 0);

  const statusColors: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700 border-emerald-200",
    resolved: "bg-blue-100 text-blue-700 border-blue-200",
    archived: "bg-gray-100 text-gray-600 border-gray-200",
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Back Button */}
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Back to Markets
        </button>

        {/* Market Header */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <h1 className="text-2xl font-bold flex-1">{market.title}</h1>
            <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${statusColors[market.status] ?? ""}`}>
              {market.status}
            </span>
          </div>
          {market.description && (
            <p className="text-muted-foreground mb-4">{market.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>By <strong className="text-foreground">{market.creator || "Unknown"}</strong></span>
            <span>Pool: <strong className="text-foreground">${market.totalMarketBets.toFixed(2)}</strong></span>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
            ✓ {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Outcomes */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-4 text-lg">Outcomes</h2>
            <div className="space-y-3">
              {market.outcomes.map((outcome, idx) => {
                const isWinner = market.resolvedOutcomeId === outcome.id;
                return (
                  <button
                    key={outcome.id}
                    onClick={() => market.status === "active" && setSelectedOutcomeId(outcome.id)}
                    disabled={market.status !== "active"}
                    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                      market.status === "active"
                        ? selectedOutcomeId === outcome.id
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-accent/50"
                        : isWinner
                        ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 cursor-default"
                        : "border-border opacity-60 cursor-default"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="font-medium">{outcome.title}</span>
                        {isWinner && <span className="text-xs text-emerald-600 font-medium ml-1">✓ Winner</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-xl font-bold text-primary">{outcome.odds}%</p>
                        <p className="text-xs text-muted-foreground">${outcome.totalBets.toFixed(2)}</p>
                      </div>
                    </div>
                    {market.status === "active" && (
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${outcome.odds}%`,
                            backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Chart */}
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-4 text-lg">Distribution</h2>
            {hasChartData ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="45%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`$${value.toFixed(2)}`, "Bet Volume"]}
                  />
                  <Legend
                    formatter={(value) => <span className="text-sm">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex flex-col items-center justify-center h-60 text-center">
                <div className="text-4xl mb-3">📊</div>
                <p className="text-muted-foreground text-sm">No bets placed yet.</p>
                <p className="text-muted-foreground text-xs mt-1">Place the first bet!</p>
              </div>
            )}
          </div>
        </div>

        {/* Place Bet */}
        {market.status === "active" && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold mb-4 text-lg">Place Bet</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
              <div className="sm:col-span-1">
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Selected Outcome
                </label>
                <div className="px-3 py-2.5 rounded-lg border border-border bg-muted/30 text-sm">
                  {market.outcomes.find((o) => o.id === selectedOutcomeId)?.title || "None"}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Amount ($)
                </label>
                <input
                  id="betAmount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="e.g. 50"
                  disabled={isBetting}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                {user && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Balance: <strong>${(user.balance ?? 0).toFixed(2)}</strong>
                  </p>
                )}
              </div>
              <button
                onClick={handlePlaceBet}
                disabled={isBetting || !selectedOutcomeId || !betAmount}
                className="px-4 py-2.5 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isBetting ? "Placing..." : "Place Bet"}
              </button>
            </div>
          </div>
        )}

        {/* Admin Panel */}
        {user?.role === "admin" && market.status === "active" && (
          <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/20 p-6">
            <h2 className="font-semibold mb-4 text-lg text-purple-800 dark:text-purple-300 flex items-center gap-2">
              <span>⚙️</span> Admin Controls
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Resolve */}
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1.5">
                  Winning Outcome
                </label>
                <select
                  value={resolveOutcomeId ?? ""}
                  onChange={(e) => setResolveOutcomeId(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 mb-2"
                >
                  {market.outcomes.map((o) => (
                    <option key={o.id} value={o.id}>{o.title}</option>
                  ))}
                </select>
                {showConfirm === "resolve" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleResolve}
                      disabled={isResolving}
                      className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isResolving ? "Resolving..." : "Confirm Resolve"}
                    </button>
                    <button
                      onClick={() => setShowConfirm(null)}
                      className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirm("resolve")}
                    className="w-full px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Resolve Market
                  </button>
                )}
              </div>

              {/* Archive */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1.5">Archive Market</p>
                <p className="text-xs text-muted-foreground mb-2">Returns all bets to users</p>
                {showConfirm === "archive" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleArchive}
                      disabled={isArchiving}
                      className="flex-1 px-3 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                    >
                      {isArchiving ? "Archiving..." : "Confirm Archive"}
                    </button>
                    <button
                      onClick={() => setShowConfirm(null)}
                      className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowConfirm("archive")}
                    className="w-full px-3 py-2 rounded-lg border-2 border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors mt-6"
                  >
                    Archive Market
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      {/* Similar Markets */}
        {similar.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6">
            <h2 className="font-semibold text-lg mb-4">Similar Markets</h2>
            <div className="space-y-3">
              {similar.map((s) => (
                <button
                  key={s.id}
                  onClick={() => navigate({ to: `/markets/${s.id}` })}
                  className="w-full text-left p-4 rounded-lg border border-border hover:border-primary/40 hover:bg-accent/50 transition-all group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm leading-snug group-hover:text-primary transition-colors">
                        {s.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {s.outcomesCount} outcomes · ${s.totalMarketBets.toFixed(2)} pool
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-primary font-medium group-hover:underline mt-0.5">
                      View →
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetailPage,
});
