// Fix: set winnings = 0 for all losing bets in resolved markets
// (where winnings is still NULL but the market has a resolvedOutcomeId)
import db from "./src/db/index.ts";
import { marketsTable, betsTable } from "./src/db/schema.ts";
import { eq, and, isNull, ne, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";

console.log("🔍 Finding bets in resolved markets that still have winnings = null...\n");

// Get all resolved markets
const resolvedMarkets = await db.query.marketsTable.findMany({
  where: eq(marketsTable.status, "resolved"),
  columns: { id: true, resolvedOutcomeId: true },
});

console.log(`Found ${resolvedMarkets.length} resolved markets.`);

let fixedLosers = 0;
let alreadySet = 0;

for (const market of resolvedMarkets) {
  if (!market.resolvedOutcomeId) continue;

  // Find bets in this market where winnings is still null AND outcome != winner (losers)
  const unsetLosingBets = await db.query.betsTable.findMany({
    where: and(
      eq(betsTable.marketId, market.id),
      isNull(betsTable.winnings),
      ne(betsTable.outcomeId, market.resolvedOutcomeId),
    ),
    columns: { id: true, userId: true },
  });

  if (unsetLosingBets.length > 0) {
    // Set winnings = 0 for these losers
    for (const bet of unsetLosingBets) {
      await db.update(betsTable)
        .set({ winnings: 0 })
        .where(eq(betsTable.id, bet.id));
    }
    fixedLosers += unsetLosingBets.length;
  }

  // Also check if winners still have null (edge case — all bets on same outcome)
  const unsetWinningBets = await db.query.betsTable.findMany({
    where: and(
      eq(betsTable.marketId, market.id),
      isNull(betsTable.winnings),
      eq(betsTable.outcomeId, market.resolvedOutcomeId),
    ),
    columns: { id: true, amount: true },
  });

  if (unsetWinningBets.length > 0) {
    // Get total pool
    const [poolRow] = await db
      .select({ total: sql<number>`coalesce(sum(amount), 0)` })
      .from(betsTable)
      .where(eq(betsTable.marketId, market.id));
    const totalPool = poolRow?.total ?? 0;

    // They get entire pool split proportionally among themselves
    const winnerStake = unsetWinningBets.reduce((s, b) => s + b.amount, 0);
    for (const bet of unsetWinningBets) {
      const winnings = winnerStake > 0 ? (bet.amount / winnerStake) * totalPool : 0;
      await db.update(betsTable).set({ winnings }).where(eq(betsTable.id, bet.id));
    }
    fixedLosers += unsetWinningBets.length;
  }
}

console.log(`\n✅ Fixed ${fixedLosers} bets that were missing winnings in resolved markets.`);

// Summary
const [nullInResolved] = await db
  .select({ count: sql<number>`count(*)` })
  .from(betsTable)
  .innerJoin(marketsTable, eq(betsTable.marketId, marketsTable.id))
  .where(and(eq(marketsTable.status, "resolved"), isNull(betsTable.winnings)));

console.log(`\nRemaining bets with null winnings in resolved markets: ${nullInResolved.count}`);
console.log("(Should be 0)");
