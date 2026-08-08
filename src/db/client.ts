import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

let _db: ReturnType<typeof create> | null = null;

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string."
    );
  }
  return drizzle(neon(url));
}

export function db() {
  if (!_db) {
    _db = create();
  }
  return _db;
}
