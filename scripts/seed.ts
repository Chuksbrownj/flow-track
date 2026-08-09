import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    // env vars may already be set in the environment
  }
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "admin@thrilled.com").toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrator";

  if (!password) {
    console.error("ADMIN_PASSWORD is not set in the environment.");
    process.exit(1);
  }

  const [existing] = await db().select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    console.log(`Admin user already exists (${email}).`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db().insert(users).values({
    name,
    email,
    passwordHash,
    role: "master_admin",
  });
  console.log(`Admin user created: ${email}`);
}

main().catch((error) => {
  console.error("Seeding failed:", error.message);
  process.exit(1);
});
