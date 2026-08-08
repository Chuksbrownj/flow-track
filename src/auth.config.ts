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

      if (
        isLoggedIn &&
        (pathname === "/login" ||
          pathname === "/register" ||
          pathname === "/admin/login" ||
          pathname.startsWith("/forgot-password") ||
          pathname.startsWith("/reset-password"))
      ) {
        return Response.redirect(new URL("/", request.nextUrl));
      }
      if (
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname === "/admin/login" ||
        pathname.startsWith("/forgot-password") ||
        pathname.startsWith("/reset-password")
      ) {
        return true;
      }
      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
