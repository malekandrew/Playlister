import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config (no Prisma/Node.js imports).
 * Used by middleware for JWT-based route protection.
 * The full config with the Credentials provider + authorize lives in auth.ts.
 */
export const authConfig = {
  session: {
    strategy: "jwt" as const,
    maxAge: 24 * 60 * 60, // 24 hours
  },
  pages: {
    signIn: "/login",
  },
  providers: [], // populated in auth.ts with Credentials
  callbacks: {
    authorized: async ({
      auth: session,
      request,
    }: {
      auth: { user?: unknown } | null;
      request: { nextUrl: { pathname: string } };
    }) => {
      const isLoggedIn = !!session?.user;
      const { pathname } = request.nextUrl;
      const isProtected =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/sources") ||
        pathname.startsWith("/sublists") ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/api/sources") ||
        pathname.startsWith("/api/sublists") ||
        pathname.startsWith("/api/sync") ||
        pathname.startsWith("/api/settings") ||
        pathname.startsWith("/api/auth/password");

      if (isProtected) {
        return isLoggedIn;
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
