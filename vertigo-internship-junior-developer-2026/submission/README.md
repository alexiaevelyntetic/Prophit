# Submission — Prophit

## How to Run

```bash
# 1. Install dependencies
cd server && bun install && cd ../client && bun install

# 2. Set up the database
cd ../server
cp .env.example .env
bun run db:generate
bun run db:migrate
bun run db:reset        # seeds with test users & markets

# 3. Create an admin account
bun create-admin.ts
# → admin@predictmarket.com / admin123

# 4. Start the app (two terminals)
bun run dev             # backend on :4001
cd ../client && bun run dev  # frontend on :3000
```

## Design Choices

### Stack
I kept the provided stack (Bun + Elysia + SQLite + Drizzle on the backend, React + TanStack Router on the frontend) without switching frameworks. The stack is fast, strongly typed end-to-end, and straightforward to run locally.

### Database Schema Extensions
The original schema was missing several pieces needed by the requirements. I added:
- `balance` and `role` (`user` | `admin`) on the `users` table — balance starts at 1000 and is deducted on bet placement and credited on market resolution.
- `winnings` on the `bets` table — `null` means the bet is still active, `0` means lost, and a positive number means won. This makes it trivial to distinguish active vs resolved bets without joining markets.
- `isArchived` on the `markets` table and an `archived` status to separate archived markets from resolved ones.
- `apiKey` on the `users` table for the bonus API key feature.

### Real-time Updates
I chose **polling every 5 seconds** over WebSockets or SSE. A `setInterval` with a silent background fetch is easy to understand, easy to maintain, and works reliably.

### Pagination
All paginated endpoints return `{ data, total, page, totalPages }`. The frontend uses a shared `<Pagination>` component that takes `currentPage`, `totalPages`, and `onPageChange`. 20 items per page throughout, as specified.

### Payout Distribution
When a market is resolved, the entire bet pool is distributed to winners **proportionally by their stake**:
```
winnings_i = (stake_i / total_winners_stake) * total_pool
```
This means winners who bet more receive a larger share, which is the standard parimutuel model used by real prediction markets.

### Archive vs Resolve
Archiving cancels a market without declaring a winner — all bets are refunded in full (winnings = amount). Resolving picks a winning outcome and distributes the whole pool to winners. Both actions require admin authentication.

### Role System & Admin Authentication
User roles are stored in the database. The auth middleware checks `user.role === "admin"` server-side for resolve and archive endpoints — there is no client-side-only protection. The admin UI panel on the Market Detail page is simply hidden for non-admin users; the protection is enforced by the API.

### API Key (Bonus)
The API key is stored as a column on the user and authenticated via `Authorization: ApiKey <key>` in the same middleware that handles JWT Bearer tokens. No separate endpoint layer was created — the same market and bet endpoints work for both browser users and API key users, keeping the codebase DRY.

### UI Decisions
- **No page refreshes needed** — markets, odds, and profile bets update automatically.
- **Confirmation dialogs** for destructive admin actions (resolve, archive) to prevent accidental clicks.
- **Balance validation** client-side before submitting a bet, with a clear error message showing the current balance.
- **Empty and loading states** on every list so the app never shows a broken blank screen.

## Challenges

**SQLite locking.** Running migration or seeding scripts while the dev server holds the database open caused `SQLITE_BUSY` errors. The fix is to stop the server before running scripts. For a production setup, WAL mode would eliminate most of these conflicts.

**TanStack Router file-based routing.** Adding new pages (`/profile`, `/leaderboard`) requires updating the auto-generated `routeTree.gen.ts`. Normally the Vite plugin regenerates this on save, but on Windows with the hot-reload server running, I had to update it manually to avoid import errors.

**Seeded data had no resolved markets.** The original seed created 5 000 users, 3 000 markets, and 140 000 bets but left all markets active and all `winnings` null, making the leaderboard empty. I wrote a separate `seed-resolved.ts` script that resolves a configurable batch of markets and distributes winnings so the leaderboard is populated out of the box.