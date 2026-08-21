import type { DefaultSession } from "next-auth";
import type { UserRole } from "@/types/user-role";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      topic: string | null;
    } & DefaultSession["user"];
  }
  interface User {
    role: UserRole;
    topic: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    topic: string | null;
  }
}
