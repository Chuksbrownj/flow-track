import type { NextAuthConfig } from "next-auth";

const adminPaths = [
  "/dashboard",
  "/trainees",
  "/attendance",
  "/assessments",
  "/schedule",
  "/reports",
  "/settings",
];

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const role = auth?.user?.role;
      const { pathname } = request.nextUrl;
      const isAdminPath = adminPaths.some((path) => pathname.startsWith(path));
      const isTraineePath = pathname.startsWith("/portal");

      if (isLoggedIn && (pathname === "/login" || pathname === "/register")) {
        return Response.redirect(new URL(role === "admin" ? "/dashboard" : "/portal", request.nextUrl));
      }
      if (pathname === "/" || pathname.startsWith("/login") || pathname.startsWith("/register")) {
        return true;
      }
      if (!isLoggedIn) {
        return Response.redirect(new URL("/login", request.nextUrl));
      }
      if (role === "admin" && isTraineePath) {
        return Response.redirect(new URL("/dashboard", request.nextUrl));
      }
      if (role !== "admin" && isAdminPath) {
        return Response.redirect(new URL("/portal", request.nextUrl));
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
