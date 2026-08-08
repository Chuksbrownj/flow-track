import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = request.nextUrl;

      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/register")) {
        return true;
      }
      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
