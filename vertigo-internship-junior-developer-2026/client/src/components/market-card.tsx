import { Market } from "@/lib/api";
import { useNavigate } from "@tanstack/react-router";

interface MarketCardProps {
  market: Market;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800",
  resolved: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-800",
  archived: "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800/30 dark:text-gray-400 dark:border-gray-700",
};

export function MarketCard({ market }: MarketCardProps) {
  const navigate = useNavigate();

  const topOutcome = market.outcomes.reduce(
    (best, o) => (o.odds > best.odds ? o : best),
    market.outcomes[0] ?? { odds: 0, title: "" },
  );

  return (
    <div
      onClick={() => navigate({ to: `/markets/${market.id}` })}
      className="group rounded-xl border border-border bg-card hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
    >
      {/* Top accent line based on status */}
      <div
        className={`h-1 ${
          market.status === "active"
            ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
            : market.status === "resolved"
            ? "bg-gradient-to-r from-blue-400 to-blue-600"
            : "bg-muted"
        }`}
      />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <h3 className="font-semibold text-base leading-snug flex-1 group-hover:text-primary transition-colors line-clamp-2">
            {market.title}
          </h3>
          <span
            className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border capitalize ${
              STATUS_STYLES[market.status] ?? ""
            }`}
          >
            {market.status}
          </span>
        </div>

        <p className="text-xs text-muted-foreground mb-4">by {market.creator || "Unknown"}</p>

        {/* Outcomes */}
        <div className="space-y-2 mb-4">
          {market.outcomes.slice(0, 3).map((outcome, idx) => (
            <div key={outcome.id} className="flex items-center gap-2">
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className="text-muted-foreground truncate max-w-[70%]">{outcome.title}</span>
                  <span className={`font-bold ${outcome.id === topOutcome?.id ? "text-primary" : "text-foreground"}`}>
                    {outcome.odds}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      idx === 0 ? "bg-indigo-500" : idx === 1 ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                    style={{ width: `${outcome.odds}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
          {market.outcomes.length > 3 && (
            <p className="text-xs text-muted-foreground">+{market.outcomes.length - 3} more outcomes</p>
          )}
        </div>

        {/* Footer stats */}
        <div className="flex items-center justify-between pt-3 border-t border-border/60">
          <div>
            <p className="text-xs text-muted-foreground">Pool</p>
            <p className="text-sm font-bold">${market.totalMarketBets.toFixed(2)}</p>
          </div>
          {market.totalParticipants !== undefined && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Bettors</p>
              <p className="text-sm font-bold">{market.totalParticipants}</p>
            </div>
          )}
          <span className="text-xs font-medium text-primary group-hover:underline">
            {market.status === "active" ? "Place Bet →" : "View →"}
          </span>
        </div>
      </div>
    </div>
  );
}
