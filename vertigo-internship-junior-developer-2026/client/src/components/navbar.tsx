import { useEffect } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

export function Navbar() {
  const { user, isAuthenticated, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  // Sync balance from server every 10s when logged in
  useEffect(() => {
    if (!isAuthenticated) return;

    const syncBalance = async () => {
      try {
        const profile = await api.getUserProfile();
        updateUser({ balance: profile.balance, role: profile.role });
      } catch {
        // Silent fail — don't disrupt the UI
      }
    };

    syncBalance(); // immediate on mount
    const interval = setInterval(syncBalance, 10_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogout = () => {
    logout();
    navigate({ to: "/" });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 font-bold text-xl tracking-tight">
          <img
            src="/logo.png"
            alt="Prophit logo"
            className="w-8 h-8 rounded-lg object-cover"
          />
          <span className="bg-gradient-to-r from-violet-600 to-indigo-500 bg-clip-text text-transparent">
            Prophit
          </span>
        </Link>

        {/* Nav links */}
        {isAuthenticated && (
          <div className="hidden md:flex items-center gap-1">
            <Link
              to="/"
              className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              activeProps={{ className: "px-3 py-2 rounded-md text-sm font-medium text-foreground bg-accent" }}
            >
              Markets
            </Link>
            <Link
              to="/profile"
              className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              activeProps={{ className: "px-3 py-2 rounded-md text-sm font-medium text-foreground bg-accent" }}
            >
              Profile
            </Link>
            <Link
              to="/leaderboard"
              className="px-3 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              activeProps={{ className: "px-3 py-2 rounded-md text-sm font-medium text-foreground bg-accent" }}
            >
              Leaderboard
            </Link>
          </div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-3">
          {isAuthenticated && user ? (
            <>
              {/* Balance — updates via polling */}
              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-full">
                <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">Balance</span>
                <span className="text-emerald-700 dark:text-emerald-300 font-bold text-sm tabular-nums">
                  ${(user.balance ?? 0).toFixed(2)}
                </span>
              </div>

              {/* Admin badge */}
              {user.role === "admin" && (
                <span className="hidden sm:inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                  Admin
                </span>
              )}

              {/* Username */}
              <span className="text-sm font-medium text-muted-foreground hidden sm:block">
                {user.username}
              </span>

              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate({ to: "/auth/login" })}
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-accent transition-colors"
              >
                Login
              </button>
              <button
                onClick={() => navigate({ to: "/auth/register" })}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Sign Up
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
