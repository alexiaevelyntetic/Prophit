import { useEffect, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { api, LeaderboardResponse } from "@/lib/api";
import { Pagination } from "@/components/pagination";

const MEDAL = ["🥇", "🥈", "🥉"];

function LeaderboardPage() {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const loadLeaderboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await api.getLeaderboard(page);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leaderboard");
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => { loadLeaderboard(); }, [loadLeaderboard]);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏆</div>
          <h1 className="text-3xl font-bold mb-2">Leaderboard</h1>
          <p className="text-muted-foreground">Top predictors ranked by total winnings</p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Table */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-muted" />
                  <div className="flex-1 h-4 bg-muted rounded" />
                  <div className="w-20 h-4 bg-muted rounded" />
                </div>
              ))}
            </div>
          ) : !data || data.leaderboard.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="text-4xl mb-3">📊</div>
              <p className="text-muted-foreground">No winners yet.</p>
              <p className="text-sm text-muted-foreground mt-1">
                Be the first to win a resolved market!
              </p>
            </div>
          ) : (
            <>
              {/* Top 3 Podium */}
              {page === 1 && data.leaderboard.length >= 3 && (
                <div className="grid grid-cols-3 gap-2 p-4 border-b border-border bg-gradient-to-b from-amber-50/50 dark:from-amber-950/10 to-transparent">
                  {/* 2nd place */}
                  <div className="flex flex-col items-center text-center pt-4">
                    <div className="text-3xl mb-1">🥈</div>
                    <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-lg mb-1">
                      {data.leaderboard[1]?.username[0].toUpperCase()}
                    </div>
                    <p className="text-xs font-medium truncate w-full">{data.leaderboard[1]?.username}</p>
                    <p className="text-xs text-muted-foreground">${data.leaderboard[1]?.totalWinnings.toFixed(0)}</p>
                  </div>
                  {/* 1st place */}
                  <div className="flex flex-col items-center text-center">
                    <div className="text-4xl mb-1">🥇</div>
                    <div className="w-14 h-14 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center font-bold text-xl mb-1">
                      {data.leaderboard[0]?.username[0].toUpperCase()}
                    </div>
                    <p className="text-sm font-semibold truncate w-full">{data.leaderboard[0]?.username}</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">${data.leaderboard[0]?.totalWinnings.toFixed(0)}</p>
                  </div>
                  {/* 3rd place */}
                  <div className="flex flex-col items-center text-center pt-6">
                    <div className="text-3xl mb-1">🥉</div>
                    <div className="w-12 h-12 rounded-full bg-orange-200 dark:bg-orange-800 flex items-center justify-center font-bold text-lg mb-1">
                      {data.leaderboard[2]?.username[0].toUpperCase()}
                    </div>
                    <p className="text-xs font-medium truncate w-full">{data.leaderboard[2]?.username}</p>
                    <p className="text-xs text-muted-foreground">${data.leaderboard[2]?.totalWinnings.toFixed(0)}</p>
                  </div>
                </div>
              )}

              {/* Full List */}
              <div className="divide-y divide-border">
                {data.leaderboard.map((entry) => (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-4 px-6 py-4 transition-colors hover:bg-accent/30 ${
                      entry.rank <= 3 && page === 1 ? "bg-amber-50/30 dark:bg-amber-950/5" : ""
                    }`}
                  >
                    {/* Rank */}
                    <div className="w-8 text-center shrink-0">
                      {entry.rank <= 3 && page === 1 ? (
                        <span className="text-xl">{MEDAL[entry.rank - 1]}</span>
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">#{entry.rank}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                      entry.rank === 1 ? "bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200"
                      : entry.rank === 2 ? "bg-slate-200 dark:bg-slate-700"
                      : entry.rank === 3 ? "bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200"
                      : "bg-muted"
                    }`}>
                      {entry.username[0].toUpperCase()}
                    </div>

                    {/* Name */}
                    <span className="flex-1 font-medium">{entry.username}</span>

                    {/* Winnings */}
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      ${entry.totalWinnings.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              <div className="p-4 border-t border-border">
                <Pagination
                  currentPage={page}
                  totalPages={data.totalPages}
                  onPageChange={setPage}
                />
                {data.total > 0 && (
                  <p className="text-center text-xs text-muted-foreground mt-2">
                    {data.total} total winners
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});
