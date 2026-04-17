import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { handleGetUserProfile, handleGetLeaderboard, handleGenerateApiKey } from "./handlers";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(authMiddleware)
  // Leaderboard - public
  .get("/leaderboard", handleGetLeaderboard, {
    query: t.Object({ page: t.Optional(t.String()) }),
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
        .get("/me", handleGetUserProfile, {
          query: t.Object({
            activePage: t.Optional(t.String()),
            resolvedPage: t.Optional(t.String()),
          }),
        })
        .post("/api-key", handleGenerateApiKey),
  );
