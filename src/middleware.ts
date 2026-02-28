import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sources/:path*",
    "/sublists/:path*",
    "/settings/:path*",
    "/api/sources/:path*",
    "/api/sublists/:path*",
    "/api/sync/:path*",
    "/api/settings/:path*",
    "/api/auth/password/:path*",
  ],
};
