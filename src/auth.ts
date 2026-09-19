import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb } from "@/db/index";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/login",
    error: "/auth/login",
  },
  callbacks: {
    async signIn({ user }) {
      const db = getDb();
      if (!db || !user.email) return true;

      const email = user.email;
      const name = user.name || email.split("@")[0];
      const avatarUrl = user.image || null;

      // Check if user already exists (match by email — handles existing Supabase users)
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (existing) {
        // Update name/avatar, store DB ID on the Auth.js user object for JWT
        await db
          .update(users)
          .set({ name, avatarUrl })
          .where(eq(users.id, existing.id));
        user.id = existing.id;
      } else {
        // New user
        const newId = randomUUID();
        await db.insert(users).values({ id: newId, email, name, avatarUrl });
        user.id = newId;

        // Send welcome email
        try {
          const mail = welcomeEmail(name);
          await sendEmail(email, mail.subject, mail.html);
        } catch (err) {
          console.error("[auth] Welcome email failed:", err);
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      if (user?.id) {
        token.dbUserId = user.id;
      }
      return token;
    },

    async session({ session, token }) {
      if (token.dbUserId) {
        session.user.id = token.dbUserId as string;
      }
      return session;
    },
  },
});
