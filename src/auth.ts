import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authConfig } from "@/auth.config";
import { db } from "@/db/client";
import { trainees, users } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or registration code", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const identifier =
          typeof credentials?.identifier === "string" ? credentials.identifier.trim() : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";
        if (!identifier || !password) return null;

        // Staff sign in with their email; students sign in with their registration code.
        let user:
          | (typeof users.$inferSelect & { topic: string | null })
          | undefined;
        if (identifier.includes("@")) {
          const [row] = await db()
            .select()
            .from(users)
            .where(eq(users.email, identifier.toLowerCase()))
            .limit(1);
          user = row;
        } else {
          const [trainee] = await db()
            .select({ userId: trainees.userId })
            .from(trainees)
            .where(eq(trainees.registrationNumber, identifier.toUpperCase()))
            .limit(1);
          if (trainee?.userId) {
            const [row] = await db()
              .select()
              .from(users)
              .where(eq(users.id, trainee.userId))
              .limit(1);
            user = row;
          }
        }
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role, topic: user.topic };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? "";
        token.role = user.role ?? "admin";
        token.topic = user.topic ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as string) ?? "admin";
        session.user.topic = (token.topic as string | null) ?? null;
      }
      return session;
    },
  },
});
