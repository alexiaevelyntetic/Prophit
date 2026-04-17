// Script to create an admin user
import db from "./src/db/index.ts";
import { usersTable } from "./src/db/schema.ts";
import { hashPassword } from "./src/lib/auth.ts";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@predictmarket.com";
const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123";

const existing = await db.query.usersTable.findFirst({
  where: eq(usersTable.email, ADMIN_EMAIL),
});

if (existing) {
  // Upgrade to admin
  await db
    .update(usersTable)
    .set({ role: "admin" })
    .where(eq(usersTable.email, ADMIN_EMAIL));
  console.log(`✅ User '${ADMIN_EMAIL}' upgraded to admin!`);
} else {
  // Create new admin
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  await db.insert(usersTable).values({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    passwordHash,
    balance: 10000,
    role: "admin",
  });
  console.log(`✅ Admin user created!`);
}

console.log(`\nLogin credentials:`);
console.log(`  Email:    ${ADMIN_EMAIL}`);
console.log(`  Password: ${ADMIN_PASSWORD}`);
console.log(`  Role:     admin`);
