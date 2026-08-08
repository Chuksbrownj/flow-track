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

      if (isLoggedIn && pathname === "/login") {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (pathname === "/" || pathname.startsWith("/login")) {
        return true;
      }
      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
