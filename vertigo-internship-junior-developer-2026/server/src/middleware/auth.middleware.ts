import { Elysia } from "elysia";
import { getUserById } from "../lib/auth";
import db from "../db";
import { usersTable } from "../db/schema";
import { eq } from "drizzle-orm";

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers, jwt }) => {
    const authHeader = headers["authorization"];
    if (!authHeader) return { user: null };

    // Support: Authorization: ApiKey pm_xxx
    if (authHeader.startsWith("ApiKey ")) {
      const apiKey = authHeader.substring(7).trim();
      const user = await db.query.usersTable.findFirst({
        where: eq(usersTable.apiKey, apiKey),
      });
      return { user: user ?? null };
    }

    // Support: Authorization: Bearer <jwt>
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const payload = await jwt.verify(token);
      if (!payload) return { user: null };
      const user = await getUserById(payload.userId);
      return { user };
    }

    return { user: null };
  })
  .as("plugin");
