import { useEffect, useState, useCallback } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, UserProfile } from "@/lib/api";
import { Pagination } from "@/components/pagination";

function ProfilePage() {
  const { isAuthenticated, user: authUser, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [apiKeyLoading, setApiKeyLoading] = useState(false);
  const [apiKeyCopied, setApiKeyCopied] = useState(false);

  const loadProfile = useCallback(
    async (silent = false) => {
      if (!isAuthenticated) return;
      try {
        if (!silent) setIsLoading(true);
        const data = await api.getUserProfile(activePage, resolvedPage);
        setProfile(data);
        if (updateUser) updateUser({ balance: data.balance });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load profile");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [isAuthenticated, activePage, resolvedPage],
  );

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Real-time for active bets (odds update)
  useEffect(() => {
    const interval = setInterval(() => loadProfile(true), 5000);
    return () => clearInterval(interval);
  }, [loadProfile]);

  const handleGenerateApiKey = async () => {
    try {
      setApiKeyLoading(true);
      const { apiKey } = await api.generateApiKey();
      setProfile((prev) => (prev ? { ...prev, apiKey } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setApiKeyLoading(false);
    }
  };

  const handleCopyApiKey = () => {
    if (profile?.apiKey) {
      navigator.clipboard.writeText(profile.apiKey);
      setApiKeyCopied(true);
      setTimeout(() => setApiKeyCopied(false), 2000);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Please log in to view your profile</p>
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
      <div className="min-h-[calc(100vh-4rem)]">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Profile Header */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary">
              {profile.username[0].toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{profile.username}</h1>
                {profile.role === "admin" && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-sm">{profile.email}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Balance</p>
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                ${profile.balance.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-3xl font-bold">{profile.activeBets.total}</p>
            <p className="text-sm text-muted-foreground mt-1">Active Bets</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-3xl font-bold">{profile.resolvedBets.total}</p>
            <p className="text-sm text-muted-foreground mt-1">Resolved Bets</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            {(() => {
              const won = profile.resolvedBets.wonCount ?? 0;
              const total = profile.resolvedBets.total;
              const rate = total > 0 ? Math.round((won / total) * 100) : null;
              return (
                <>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {rate !== null ? `${rate}%` : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Win Rate {total > 0 ? `(${won}/${total})` : ""}
                  </p>
                </>
              );
            })()}
          </div>
        </div>

        {/* Active Bets */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">Active Bets</h2>
            <span className="text-xs text-muted-foreground">Updates every 5s</span>
          </div>
          {profile.activeBets.data.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">🎯</div>
              <p className="text-muted-foreground text-sm">No active bets</p>
              <Link
                to="/"
                className="inline-block mt-3 text-sm text-primary hover:underline"
              >
                Browse Markets →
              </Link>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {profile.activeBets.data.map((bet) => (
                  <Link
                    key={bet.id}
                    to="/markets/$id"
                    params={{ id: String(bet.marketId) }}
                    className="block p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{bet.marketTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Bet on: <strong>{bet.outcomeTitle}</strong>
                        </p>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-sm font-bold">${bet.amount.toFixed(2)}</p>
                        <p className="text-xs text-primary font-medium">{bet.currentOdds}% odds</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Pagination
                currentPage={activePage}
                totalPages={profile.activeBets.totalPages}
                onPageChange={setActivePage}
              />
            </>
          )}
        </div>

        {/* Resolved Bets */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-lg mb-4">Resolved Bets</h2>
          {profile.resolvedBets.data.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">📋</div>
              <p className="text-muted-foreground text-sm">No resolved bets yet</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {profile.resolvedBets.data.map((bet) => (
                  <Link
                    key={bet.id}
                    to="/markets/$id"
                    params={{ id: String(bet.marketId) }}
                    className="block p-4 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{bet.marketTitle}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Bet on: <strong>{bet.outcomeTitle}</strong>
                        </p>
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <p className="text-sm font-medium">${bet.amount.toFixed(2)}</p>
                        {bet.won ? (
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            +${bet.winnings.toFixed(2)} won
                          </p>
                        ) : (
                          <p className="text-xs font-medium text-destructive">Lost</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Pagination
                currentPage={resolvedPage}
                totalPages={profile.resolvedBets.totalPages}
                onPageChange={setResolvedPage}
              />
            </>
          )}
        </div>

        {/* API Key Section (Bonus) */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-lg mb-1">Developer API</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Use your API key to place bets programmatically. Send{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">Authorization: ApiKey YOUR_KEY</code>{" "}
            in your requests.
          </p>

          {profile.apiKey ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-muted px-3 py-2.5 rounded-lg font-mono overflow-x-auto">
                  {profile.apiKey}
                </code>
                <button
                  onClick={handleCopyApiKey}
                  className="shrink-0 px-3 py-2.5 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
                >
                  {apiKeyCopied ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={handleGenerateApiKey}
                disabled={apiKeyLoading}
                className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50 transition-colors"
              >
                {apiKeyLoading ? "Regenerating..." : "Regenerate key"}
              </button>
            </div>
          ) : (
            <button
              onClick={handleGenerateApiKey}
              disabled={apiKeyLoading}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {apiKeyLoading ? "Generating..." : "Generate API Key"}
            </button>
          )}

          <div className="mt-4 p-4 rounded-lg bg-muted/50 text-xs space-y-1 text-muted-foreground font-mono">
            <p className="font-semibold text-foreground text-sm mb-2 font-sans">Available Endpoints</p>
            <p><span className="text-blue-600">GET</span>    /api/markets?status=active&page=1</p>
            <p><span className="text-blue-600">GET</span>    /api/markets/:id</p>
            <p><span className="text-emerald-600">POST</span>   /api/markets {"{ title, description, outcomes[] }"}</p>
            <p><span className="text-emerald-600">POST</span>   /api/markets/:id/bets {"{ outcomeId, amount }"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});
