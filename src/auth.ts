import NextAuth, { getServerSession, type NextAuthOptions } from "next-auth";
import Google from "next-auth/providers/google";
import { getEnv } from "@/config/env";
import { logger } from "@/infrastructure/logging/logger";
import { synchronizeGoogleUser } from "@/modules/auth/google-user";

declare module "next-auth" {
  interface Session { user: { id: string; name?: string | null; email?: string | null; image?: string | null }; }
}

export function createAuthOptions(): NextAuthOptions {
  const env = getEnv();
  return {
    secret: env.AUTH_SECRET,
    providers: [Google({ clientId: env.AUTH_GOOGLE_ID || "", clientSecret: env.AUTH_GOOGLE_SECRET || "", checks: ["pkce", "state"] })],
    session: { strategy: "jwt" },
    pages: { signIn: "/auth/login", error: "/auth/login" },
    logger: {
      error: (code) => logger.error({ event: "auth.error", code }),
      warn: (code) => logger.warn({ event: "auth.warning", code }),
      debug: () => undefined,
    },
    callbacks: {
      async signIn({ user, account, profile }) {
        if (account?.provider !== "google" || !user.email || !(profile && "email_verified" in profile && profile.email_verified === true)) return false;
        try {
          user.id = await synchronizeGoogleUser({ email: user.email, name: user.name, image: user.image });
          return true;
        } catch {
          logger.error({ event: "auth.identity_failed", code: "DATABASE_UNAVAILABLE" });
          return false;
        }
      },
      async jwt({ token, user }) { if (user?.id) token.dbUserId = user.id; return token; },
      async session({ session, token }) { if (typeof token.dbUserId === "string") session.user.id = token.dbUserId; return session; },
    },
  };
}

export const auth = () => getServerSession(createAuthOptions());
const handler = NextAuth(createAuthOptions());
export const handlers = { GET: handler, POST: handler };
