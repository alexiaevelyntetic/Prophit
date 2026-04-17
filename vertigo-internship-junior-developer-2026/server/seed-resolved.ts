// Script: resolve a batch of markets and distribute winnings
// Usage: bun seed-resolved.ts [count]

import db from "./src/db/index.ts";
import { marketsTable, marketOutcomesTable, betsTable, usersTable } from "./src/db/schema.ts";
import { eq, and, isNull, sql } from "drizzle-orm";

const COUNT = parseInt(process.argv[2] || "300", 10);

console.log(`🎯 Resolving ${COUNT} markets and distributing winnings...\n`);

// Get active markets that have bets
const activeMarkets = await db.query.marketsTable.findMany({
  where: eq(marketsTable.status, "active"),
  with: {
    outcomes: true,
  },
  limit: COUNT,
});

let resolved = 0;
let skipped = 0;

for (const market of activeMarkets) {
  if (market.outcomes.length === 0) { skipped++; continue; }

  // Pick a random winning outcome
  const winningOutcome = market.outcomes[Math.floor(Math.random() * market.outcomes.length)];

  // Get all bets for this market
  const allBets = await db.query.betsTable.findMany({
    where: eq(betsTable.marketId, market.id),
  });

  if (allBets.length === 0) { skipped++; continue; }

  const totalPool = allBets.reduce((s, b) => s + b.amount, 0);
  const winningBets = allBets.filter((b) => b.outcomeId === winningOutcome.id);
  const losingBets = allBets.filter((b) => b.outcomeId !== winningOutcome.id);
  const winnersTotalStake = winningBets.reduce((s, b) => s + b.amount, 0);

  // Distribute to winners
  for (const bet of winningBets) {
    const winnings = winnersTotalStake > 0
      ? (bet.amount / winnersTotalStake) * totalPool
      : 0;
    await db.update(betsTable).set({ winnings }).where(eq(betsTable.id, bet.id));
    await db
      .update(usersTable)
      .set({ balance: sql`balance + ${winnings}` })
      .where(eq(usersTable.id, bet.userId));
  }

  // Mark losers
  for (const bet of losingBets) {
    await db.update(betsTable).set({ winnings: 0 }).where(eq(betsTable.id, bet.id));
  }

  // Resolve market
  await db.update(marketsTable).set({
    status: "resolved",
    resolvedOutcomeId: winningOutcome.id,
  }).where(eq(marketsTable.id, market.id));

  resolved++;
  if (resolved % 50 === 0) {
    console.log(`  ✓ ${resolved}/${COUNT} markets resolved...`);
  }
}

console.log(`\n✅ Done! Resolved ${resolved} markets, skipped ${skipped}.`);

// Show top 5 leaderboard
const top5 = await db
  .select({
    username: usersTable.username,
    totalWinnings: sql<number>`coalesce(sum(${betsTable.winnings}), 0)`,
  })
  .from(betsTable)
  .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
  .where(sql`${betsTable.winnings} IS NOT NULL AND ${betsTable.winnings} > 0`)
  .groupBy(betsTable.userId, usersTable.username)
  .orderBy(sql`sum(${betsTable.winnings}) DESC`)
  .limit(5);

console.log("\n🏆 Top 5 Leaderboard:");
top5.forEach((u, i) => {
  console.log(`  ${i + 1}. ${u.username} — $${Number(u.totalWinnings).toFixed(2)}`);
});
