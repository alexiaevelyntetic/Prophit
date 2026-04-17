import { eq, and, desc, asc, sql, isNull, isNotNull, gt } from "drizzle-orm";
import db from "../db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../db/schema";
import { hashPassword, verifyPassword, type AuthTokenPayload } from "../lib/auth";
import {
  validateRegistration,
  validateLogin,
  validateMarketCreation,
  validateBet,
} from "../lib/validation";

const PAGE_SIZE = 20;

type JwtSigner = {
  sign: (payload: AuthTokenPayload) => Promise<string>;
};

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function handleRegister({
  body,
  jwt,
  set,
}: {
  body: { username: string; email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { username, email, password } = body;
  const errors = validateRegistration(username, email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const existingUser = await db.query.usersTable.findFirst({
    where: (users, { or, eq }) => or(eq(users.email, email), eq(users.username, username)),
  });

  if (existingUser) {
    set.status = 409;
    return { errors: [{ field: "email", message: "User already exists" }] };
  }

  const passwordHash = await hashPassword(password);

  const newUser = await db
    .insert(usersTable)
    .values({ username, email, passwordHash, balance: 1000, role: "user" })
    .returning();

  const token = await jwt.sign({ userId: newUser[0].id });

  set.status = 201;
  return {
    id: newUser[0].id,
    username: newUser[0].username,
    email: newUser[0].email,
    balance: newUser[0].balance,
    role: newUser[0].role,
    token,
  };
}

export async function handleLogin({
  body,
  jwt,
  set,
}: {
  body: { email: string; password: string };
  jwt: JwtSigner;
  set: { status: number };
}) {
  const { email, password } = body;
  const errors = validateLogin(email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    set.status = 401;
    return { error: "Invalid email or password" };
  }

  const token = await jwt.sign({ userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    balance: user.balance,
    role: user.role,
    token,
  };
}

// ─── Markets ─────────────────────────────────────────────────────────────────

export async function handleCreateMarket({
  body,
  set,
  user,
}: {
  body: { title: string; description?: string; outcomes: string[] };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const { title, description, outcomes } = body;
  const errors = validateMarketCreation(title, description || "", outcomes);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db
    .insert(marketsTable)
    .values({
      title,
      description: description || null,
      createdBy: user.id,
    })
    .returning();

  const outcomeIds = await db
    .insert(marketOutcomesTable)
    .values(
      outcomes.map((title: string, index: number) => ({
        marketId: market[0].id,
        title,
        position: index,
      })),
    )
    .returning();

  set.status = 201;
  return {
    id: market[0].id,
    title: market[0].title,
    description: market[0].description,
    status: market[0].status,
    outcomes: outcomeIds,
  };
}

export async function handleListMarkets({
  query,
}: {
  query: { status?: string; page?: string; sort?: string };
}) {
  const statusFilter = query.status || "active";
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const sort = query.sort || "date";
  const offset = (page - 1) * PAGE_SIZE;

  // Count total markets for pagination
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(marketsTable)
    .where(eq(marketsTable.status, statusFilter));
  const total = totalResult[0]?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const markets = await db.query.marketsTable.findMany({
    where: eq(marketsTable.status, statusFilter),
    with: {
      creator: { columns: { username: true } },
      outcomes: { orderBy: (outcomes, { asc }) => asc(outcomes.position) },
    },
    limit: PAGE_SIZE,
    offset,
    orderBy:
      sort === "date"
        ? desc(marketsTable.createdAt)
        : desc(marketsTable.createdAt), // will be enriched below for other sorts
  });

  const enrichedMarkets = await Promise.all(
    markets.map(async (market) => {
      const betsPerOutcome = await Promise.all(
        market.outcomes.map(async (outcome) => {
          const rows = await db
            .select({ totalAmount: sql<number>`coalesce(sum(amount), 0)`, count: sql<number>`count(*)` })
            .from(betsTable)
            .where(eq(betsTable.outcomeId, outcome.id));
          return {
            outcomeId: outcome.id,
            totalBets: rows[0]?.totalAmount ?? 0,
            participants: rows[0]?.count ?? 0,
          };
        }),
      );

      const totalMarketBets = betsPerOutcome.reduce((s, b) => s + b.totalBets, 0);
      const totalParticipants = betsPerOutcome.reduce((s, b) => s + b.participants, 0);

      return {
        id: market.id,
        title: market.title,
        description: market.description,
        status: market.status,
        creator: market.creator?.username,
        createdAt: market.createdAt,
        resolvedOutcomeId: market.resolvedOutcomeId,
        outcomes: market.outcomes.map((outcome) => {
          const ob = betsPerOutcome.find((b) => b.outcomeId === outcome.id);
          const outcomeBets = ob?.totalBets ?? 0;
          const odds =
            totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;
          return { id: outcome.id, title: outcome.title, odds, totalBets: outcomeBets };
        }),
        totalMarketBets,
        totalParticipants,
      };
    }),
  );

  // Sort in memory for totalBets / participants (would need subquery in SQL otherwise)
  if (sort === "totalBets") {
    enrichedMarkets.sort((a, b) => b.totalMarketBets - a.totalMarketBets);
  } else if (sort === "participants") {
    enrichedMarkets.sort((a, b) => b.totalParticipants - a.totalParticipants);
  }

  return { markets: enrichedMarkets, total, page, totalPages };
}

export async function handleGetMarket({
  params,
  set,
}: {
  params: { id: number };
  set: { status: number };
}) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
    with: {
      creator: { columns: { username: true } },
      outcomes: { orderBy: (outcomes, { asc }) => asc(outcomes.position) },
    },
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  const betsPerOutcome = await Promise.all(
    market.outcomes.map(async (outcome) => {
      const rows = await db
        .select({ totalAmount: sql<number>`coalesce(sum(amount), 0)` })
        .from(betsTable)
        .where(eq(betsTable.outcomeId, outcome.id));
      return { outcomeId: outcome.id, totalBets: rows[0]?.totalAmount ?? 0 };
    }),
  );

  const totalMarketBets = betsPerOutcome.reduce((s, b) => s + b.totalBets, 0);

  return {
    id: market.id,
    title: market.title,
    description: market.description,
    status: market.status,
    creator: market.creator?.username,
    createdAt: market.createdAt,
    resolvedOutcomeId: market.resolvedOutcomeId,
    outcomes: market.outcomes.map((outcome) => {
      const outcomeBets = betsPerOutcome.find((b) => b.outcomeId === outcome.id)?.totalBets ?? 0;
      const odds =
        totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;
      return { id: outcome.id, title: outcome.title, odds, totalBets: outcomeBets };
    }),
    totalMarketBets,
  };
}

export async function handlePlaceBet({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number; amount: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  const marketId = params.id;
  const { outcomeId, amount } = body;
  const errors = validateBet(amount);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(eq(marketOutcomesTable.id, outcomeId), eq(marketOutcomesTable.marketId, marketId)),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  // Check user balance
  const currentUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, user.id),
  });

  if (!currentUser || currentUser.balance < amount) {
    set.status = 400;
    return { error: "Insufficient balance" };
  }

  // Deduct balance
  await db
    .update(usersTable)
    .set({ balance: currentUser.balance - amount })
    .where(eq(usersTable.id, user.id));

  const bet = await db
    .insert(betsTable)
    .values({ userId: user.id, marketId, outcomeId, amount: Number(amount) })
    .returning();

  set.status = 201;
  return {
    id: bet[0].id,
    userId: bet[0].userId,
    marketId: bet[0].marketId,
    outcomeId: bet[0].outcomeId,
    amount: bet[0].amount,
    newBalance: currentUser.balance - amount,
  };
}

// ─── Admin: Resolve Market ────────────────────────────────────────────────────

export async function handleResolveMarket({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  if (user.role !== "admin") {
    set.status = 403;
    return { error: "Forbidden: admin only" };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is already resolved or archived" };
  }

  const winningOutcome = await db.query.marketOutcomesTable.findFirst({
    where: and(
      eq(marketOutcomesTable.id, body.outcomeId),
      eq(marketOutcomesTable.marketId, params.id),
    ),
  });

  if (!winningOutcome) {
    set.status = 404;
    return { error: "Outcome not found in this market" };
  }

  // Total bet pool for this market
  const poolResult = await db
    .select({ total: sql<number>`coalesce(sum(amount), 0)` })
    .from(betsTable)
    .where(eq(betsTable.marketId, params.id));
  const totalPool = poolResult[0]?.total ?? 0;

  // Get all bets for this market
  const allBets = await db.query.betsTable.findMany({
    where: eq(betsTable.marketId, params.id),
  });

  const winningBets = allBets.filter((b) => b.outcomeId === body.outcomeId);
  const losingBets = allBets.filter((b) => b.outcomeId !== body.outcomeId);

  const winnersTotalStake = winningBets.reduce((s, b) => s + b.amount, 0);

  // Distribute winnings proportionally
  for (const bet of winningBets) {
    const winnings =
      winnersTotalStake > 0 ? (bet.amount / winnersTotalStake) * totalPool : 0;

    await db.update(betsTable).set({ winnings }).where(eq(betsTable.id, bet.id));
    await db
      .update(usersTable)
      .set({ balance: sql`balance + ${winnings}` })
      .where(eq(usersTable.id, bet.userId));
  }

  // Mark losing bets as 0 winnings
  for (const bet of losingBets) {
    await db.update(betsTable).set({ winnings: 0 }).where(eq(betsTable.id, bet.id));
  }

  // Resolve market
  await db
    .update(marketsTable)
    .set({ status: "resolved", resolvedOutcomeId: body.outcomeId })
    .where(eq(marketsTable.id, params.id));

  return {
    message: "Market resolved successfully",
    marketId: params.id,
    resolvedOutcomeId: body.outcomeId,
    totalPool,
    winnersCount: winningBets.length,
    losersCount: losingBets.length,
  };
}

// ─── Admin: Archive Market ────────────────────────────────────────────────────

export async function handleArchiveMarket({
  params,
  set,
  user,
}: {
  params: { id: number };
  set: { status: number };
  user: typeof usersTable.$inferSelect;
}) {
  if (user.role !== "admin") {
    set.status = 403;
    return { error: "Forbidden: admin only" };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Only active markets can be archived" };
  }

  // Get active bets (not yet resolved)
  const activeBets = await db.query.betsTable.findMany({
    where: and(eq(betsTable.marketId, params.id), isNull(betsTable.winnings)),
  });

  // Return money to bettors
  for (const bet of activeBets) {
    await db.update(betsTable).set({ winnings: bet.amount }).where(eq(betsTable.id, bet.id));
    await db
      .update(usersTable)
      .set({ balance: sql`balance + ${bet.amount}` })
      .where(eq(usersTable.id, bet.userId));
  }

  // Archive market
  await db
    .update(marketsTable)
    .set({ status: "archived", isArchived: true })
    .where(eq(marketsTable.id, params.id));

  return {
    message: "Market archived and funds returned",
    marketId: params.id,
    refundedBets: activeBets.length,
  };
}

// ─── User Profile ─────────────────────────────────────────────────────────────

export async function handleGetUserProfile({
  query,
  set,
  user,
}: {
  query: { activePage?: string; resolvedPage?: string };
  set: { status: number };
  user: typeof usersTable.$inferSelect | null;
}) {
  if (!user) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  const activePage = Math.max(1, parseInt(query.activePage || "1", 10));
  const resolvedPage = Math.max(1, parseInt(query.resolvedPage || "1", 10));

  const currentUser = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, user.id),
  });

  if (!currentUser) {
    set.status = 404;
    return { error: "User not found" };
  }

  // Active bets (winnings is null)
  const activeBetsTotal = await db
    .select({ count: sql<number>`count(*)` })
    .from(betsTable)
    .where(and(eq(betsTable.userId, user.id), isNull(betsTable.winnings)));

  const activeBetsRows = await db.query.betsTable.findMany({
    where: and(eq(betsTable.userId, user.id), isNull(betsTable.winnings)),
    with: {
      market: { columns: { id: true, title: true, status: true } },
      outcome: { columns: { id: true, title: true } },
    },
    limit: PAGE_SIZE,
    offset: (activePage - 1) * PAGE_SIZE,
    orderBy: desc(betsTable.createdAt),
  });

  // Enrich active bets with current odds
  const activeBets = await Promise.all(
    activeBetsRows.map(async (bet) => {
      const betsForMarket = await db
        .select({ totalAmount: sql<number>`coalesce(sum(amount), 0)` })
        .from(betsTable)
        .where(eq(betsTable.marketId, bet.marketId));
      const marketTotal = betsForMarket[0]?.totalAmount ?? 0;

      const betsForOutcome = await db
        .select({ totalAmount: sql<number>`coalesce(sum(amount), 0)` })
        .from(betsTable)
        .where(eq(betsTable.outcomeId, bet.outcomeId));
      const outcomeTotal = betsForOutcome[0]?.totalAmount ?? 0;

      const currentOdds =
        marketTotal > 0 ? Number(((outcomeTotal / marketTotal) * 100).toFixed(2)) : 0;

      return {
        id: bet.id,
        marketId: bet.marketId,
        marketTitle: bet.market?.title,
        outcomeTitle: bet.outcome?.title,
        amount: bet.amount,
        currentOdds,
        createdAt: bet.createdAt,
      };
    }),
  );

  // Resolved bets (winnings is not null — market was resolved/archived)
  const resolvedBetsTotal = await db
    .select({ count: sql<number>`count(*)` })
    .from(betsTable)
    .where(and(eq(betsTable.userId, user.id), isNotNull(betsTable.winnings)));

  // Count won bets (winnings > 0)
  const wonBetsTotal = await db
    .select({ count: sql<number>`count(*)` })
    .from(betsTable)
    .where(and(eq(betsTable.userId, user.id), gt(betsTable.winnings, 0)));

  const resolvedBetsRows = await db.query.betsTable.findMany({
    where: and(eq(betsTable.userId, user.id), isNotNull(betsTable.winnings)),
    with: {
      market: { columns: { id: true, title: true, resolvedOutcomeId: true } },
      outcome: { columns: { id: true, title: true } },
    },
    limit: PAGE_SIZE,
    offset: (resolvedPage - 1) * PAGE_SIZE,
    orderBy: desc(betsTable.createdAt),
  });

  const resolvedBets = resolvedBetsRows.map((bet) => ({
    id: bet.id,
    marketId: bet.marketId,
    marketTitle: bet.market?.title,
    outcomeTitle: bet.outcome?.title,
    amount: bet.amount,
    winnings: bet.winnings,
    won: (bet.winnings ?? 0) > 0,
    createdAt: bet.createdAt,
  }));

  return {
    id: currentUser.id,
    username: currentUser.username,
    email: currentUser.email,
    balance: currentUser.balance,
    role: currentUser.role,
    apiKey: currentUser.apiKey,
    activeBets: {
      data: activeBets,
      total: activeBetsTotal[0]?.count ?? 0,
      page: activePage,
      totalPages: Math.max(1, Math.ceil((activeBetsTotal[0]?.count ?? 0) / PAGE_SIZE)),
    },
    resolvedBets: {
      data: resolvedBets,
      total: resolvedBetsTotal[0]?.count ?? 0,
      wonCount: wonBetsTotal[0]?.count ?? 0,
      page: resolvedPage,
      totalPages: Math.max(1, Math.ceil((resolvedBetsTotal[0]?.count ?? 0) / PAGE_SIZE)),
    },
  };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export async function handleGetLeaderboard({
  query,
}: {
  query: { page?: string };
}) {
  const page = Math.max(1, parseInt(query.page || "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  const totalResult = await db
    .select({ count: sql<number>`count(distinct ${betsTable.userId})` })
    .from(betsTable)
    .where(sql`${betsTable.winnings} IS NOT NULL AND ${betsTable.winnings} > 0`);
  const total = totalResult[0]?.count ?? 0;

  const rows = await db
    .select({
      userId: betsTable.userId,
      username: usersTable.username,
      totalWinnings: sql<number>`coalesce(sum(${betsTable.winnings}), 0)`,
    })
    .from(betsTable)
    .innerJoin(usersTable, eq(betsTable.userId, usersTable.id))
    .where(sql`${betsTable.winnings} IS NOT NULL AND ${betsTable.winnings} > 0`)
    .groupBy(betsTable.userId, usersTable.username)
    .orderBy(desc(sql`coalesce(sum(${betsTable.winnings}), 0)`))
    .limit(PAGE_SIZE)
    .offset(offset);

  return {
    leaderboard: rows.map((r, i) => ({
      rank: offset + i + 1,
      userId: r.userId,
      username: r.username,
      totalWinnings: Number(r.totalWinnings.toFixed(2)),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

// ─── API Key ──────────────────────────────────────────────────────────────────

export async function handleGenerateApiKey({
  set,
  user,
}: {
  set: { status: number };
  user: typeof usersTable.$inferSelect | null;
}) {
  if (!user) {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  // Generate a crypto-random key
  const apiKey = `pm_${crypto.randomUUID().replace(/-/g, "")}`;

  await db.update(usersTable).set({ apiKey }).where(eq(usersTable.id, user.id));

  return { apiKey };
}

// ─── Similar Markets ──────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "will", "the", "a", "an", "this", "that", "year", "be", "in", "to", "of",
  "for", "by", "at", "is", "it", "its", "on", "above", "below", "before",
  "after", "new", "next", "record", "hit", "2024", "2025", "2026", "2027",
]);

export async function handleGetSimilarMarkets({
  params,
}: {
  params: { id: number };
}) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
    columns: { id: true, title: true, status: true },
  });

  if (!market) return { similar: [] };

  // Extract meaningful keywords from the title
  const keywords = market.title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w))
    .slice(0, 4);

  if (keywords.length === 0) return { similar: [] };

  // Build OR conditions — find active markets matching any keyword
  const likeConditions = keywords.map(
    (kw) => sql`lower(${marketsTable.title}) LIKE ${`%${kw}%`}`,
  );

  const orClause = likeConditions.reduce((acc, c) => sql`${acc} OR ${c}`);

  const candidates = await db.query.marketsTable.findMany({
    where: and(
      eq(marketsTable.status, "active"),
      sql`${marketsTable.id} != ${params.id}`,
      sql`(${orClause})`,
    ),
    with: {
      outcomes: { columns: { id: true, title: true } },
    },
    limit: 8,
    orderBy: desc(marketsTable.createdAt),
  });

  // Score by how many keywords match, return top 3
  const scored = candidates
    .map((m) => ({
      ...m,
      score: keywords.filter((kw) => m.title.toLowerCase().includes(kw)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Enrich with total bets
  const similar = await Promise.all(
    scored.map(async (m) => {
      const [{ total }] = await db
        .select({ total: sql<number>`coalesce(sum(${betsTable.amount}), 0)` })
        .from(betsTable)
        .where(eq(betsTable.marketId, m.id));
      return {
        id: m.id,
        title: m.title,
        status: m.status,
        outcomesCount: m.outcomes.length,
        totalMarketBets: Number(total),
      };
    }),
  );

  return { similar };
}
