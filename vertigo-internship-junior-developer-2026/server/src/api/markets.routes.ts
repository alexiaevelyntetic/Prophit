import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  handleCreateMarket,
  handleListMarkets,
  handleGetMarket,
  handleGetSimilarMarkets,
  handlePlaceBet,
  handleResolveMarket,
  handleArchiveMarket,
} from "./handlers";

export const marketRoutes = new Elysia({ prefix: "/api/markets" })
  .use(authMiddleware)
  // Public routes (auth optional)
  .get("/", handleListMarkets, {
    query: t.Object({
      status: t.Optional(t.String()),
      page: t.Optional(t.String()),
      sort: t.Optional(t.String()),
    }),
  })
  .get("/:id", handleGetMarket, {
    params: t.Object({ id: t.Numeric() }),
  })
  .get("/:id/similar", handleGetSimilarMarkets, {
    params: t.Object({ id: t.Numeric() }),
  })
  // Authenticated routes
  .guard(
    {
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .post("/", handleCreateMarket, {
          body: t.Object({
            title: t.String(),
            description: t.Optional(t.String()),
            outcomes: t.Array(t.String()),
          }),
        })
        .post("/:id/bets", handlePlaceBet, {
          params: t.Object({ id: t.Numeric() }),
          body: t.Object({
            outcomeId: t.Number(),
            amount: t.Number(),
          }),
        })
        // Admin only
        .post("/:id/resolve", handleResolveMarket, {
          params: t.Object({ id: t.Numeric() }),
          body: t.Object({ outcomeId: t.Number() }),
        })
        .post("/:id/archive", handleArchiveMarket, {
          params: t.Object({ id: t.Numeric() }),
        }),
  );
