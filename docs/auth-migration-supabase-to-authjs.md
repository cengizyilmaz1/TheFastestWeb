# Auth Migration: Supabase Auth → Auth.js (NextAuth v5)

## The Problem

### India ISP DNS Block of Supabase (Feb 24, 2026)

The Indian government issued an order blocking `*.supabase.co` at the DNS level across major ISPs (Jio, Airtel, BSNL, etc.). This caused Google sign-in to completely break for Indian users.

**Root cause:** Supabase's Google OAuth flow hardcodes the callback URL to:
```
https://<project-ref>.supabase.co/auth/v1/callback
```
When a user clicks "Sign in with Google", Google redirects back to this `supabase.co` URL after authentication. Since `supabase.co` was DNS-blocked for Indian users, the redirect never resolved — the sign-in silently failed.

**What still worked:** The database connection (via `DATABASE_URL` pointing to the Supabase Postgres pooler) was unaffected. Only the auth flow was broken.

---

## Workarounds Attempted (and Why They Failed)

### 1. Vercel Rewrite Proxy
Configured `next.config.ts` to proxy `/supabase-proxy/:path*` → `https://<ref>.supabase.co/:path*`.

**Failed:** Vercel's edge servers received `525 SSL Handshake Error` from Supabase's origin. The SSL issue was at Supabase's end and affected all proxied connections, not just Indian DNS.

### 2. JioBase Proxy (`jiobase.com`)
JioBase is a community-built Cloudflare-backed proxy for Supabase. Updated the browser client to route through `https://thefastestweb.jiobase.com` and added the JioBase callback URL to Google Console.

**Failed:** Even with the proxy, Google OAuth is initiated by the Supabase SDK with the callback hardcoded to `https://<ref>.supabase.co/auth/v1/callback`. The JioBase proxy URL is never used as the OAuth callback — Google still redirects to the original `supabase.co` URL. The proxy cannot intercept an OAuth redirect it was never told about.

### 3. Supabase Custom Domain (Rejected)
Supabase Pro plan ($25/mo) supports custom domains, which would let the OAuth callback go through our own domain instead of `supabase.co`.

**Rejected:** Paid plan just to fix a government-imposed block felt wrong. Also, any future government order could block the custom domain too if Supabase's IP range is targeted.

---

## The Fix: Replace Supabase Auth with Auth.js

Auth.js (NextAuth v5) handles Google OAuth entirely through our own domain. No third-party auth service involved in the OAuth flow.

### How It Works

```
User clicks "Sign in with Google"
    ↓
/api/auth/signin/google  (our server)
    ↓
Google OAuth consent screen
    ↓
https://thefastestweb.site/api/auth/callback/google  (our server)
    ↓
Auth.js exchanges code for tokens server-side
    ↓
Creates encrypted JWT, sets HttpOnly cookie
    ↓
User is logged in
```

Everything goes through `thefastestweb.site`. Zero dependency on `supabase.co` for auth.

---

## Implementation

### New Files

**`src/auth.ts`** — Core Auth.js config
```ts
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google({ clientId, clientSecret })],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      // Upsert user in our DB, match by email to preserve existing UUIDs
    },
    async jwt({ token, user }) {
      if (user?.id) token.dbUserId = user.id;
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.dbUserId;
      return session;
    },
  },
});
```

**`src/app/api/auth/[...nextauth]/route.ts`** — Auth.js handler
```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

### Modified Files

| File | Change |
|------|--------|
| `src/lib/auth.ts` | `getCurrentUser()` now reads Auth.js JWT session via `auth()` |
| `src/middleware.ts` | Replaced Supabase `updateSession` middleware with Auth.js middleware |
| `src/app/auth/login/page.tsx` | Uses `signIn("google")` from `next-auth/react` |
| `src/components/layout/UserMenu.tsx` | Uses `signOut()` from `next-auth/react` |
| `src/components/submit/SubmitPageForm.tsx` | Uses `signIn("google")` from `next-auth/react` |
| `src/components/submit/SubmitModal.tsx` | Auth check via `/api/auth/session` fetch instead of Supabase |
| `src/app/api/submit/route.ts` | Uses `auth()` instead of `supabase.auth.getUser()` |
| `src/app/api/checkout/route.ts` | Uses `auth()` instead of `supabase.auth.getUser()` |

### Deleted Files

| File | Reason |
|------|--------|
| `src/app/auth/callback/route.ts` | Auth.js handles `/api/auth/callback/google` automatically |

---

## Preserving Existing Users

Existing users had Supabase UUIDs as their primary keys, and those IDs are referenced by the `sites.owner_id` foreign key. Auth.js generates its own UUIDs on first login, which would break all site→owner links.

**Solution:** Match users by **email** in the `signIn` callback, not by provider ID:

```ts
async signIn({ user }) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, user.email))
    .limit(1);

  if (existing) {
    user.id = existing.id; // Use existing Supabase UUID — preserves all FK links
  } else {
    const newId = randomUUID();
    await db.insert(users).values({ id: newId, ... });
    user.id = newId;
  }
}
```

This UUID then gets stored in the JWT (`token.dbUserId`) and surfaces as `session.user.id`. All downstream code that used `authUser.id` now uses `session.user.id` — same value, different source.

---

## Security Model

### Session Storage
- JWT stored in **HttpOnly cookie** (inaccessible to JavaScript — XSS-safe)
- Cookie flags: `Secure`, `SameSite=Lax`
- Signed and encrypted with `AUTH_SECRET`

### vs. Previous Supabase Auth
Supabase stored the session in **localStorage** in addition to cookies. localStorage is fully readable by page JavaScript — any XSS vulnerability = full session theft. Auth.js's HttpOnly-only approach eliminates this attack surface.

### OAuth Token Handling
Google's access token and refresh token are exchanged server-side and never sent to the browser. The browser only receives a JWT containing `{ name, email, id }`.

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `AUTH_SECRET` | `.env.local` + Vercel | Signs/encrypts the JWT |
| `AUTH_GOOGLE_ID` | `.env.local` + Vercel | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | `.env.local` + Vercel | Google OAuth Client Secret |
| `AUTH_URL` | Vercel only | Forces Auth.js to use the production domain (prevents it from using the Vercel `.vercel.app` URL as the callback base) |

**Note:** Without `AUTH_URL` set on Vercel, Auth.js detects the base URL from the incoming request, which may resolve to the Vercel deployment URL (e.g., `thefastestweb.vercel.app`) instead of the custom domain. This causes `redirect_uri_mismatch` because Google Console only has the custom domain registered.

---

## Google Console Changes

**Authorized JavaScript Origins:**
```
http://localhost:3000
https://thefastestweb.site
```

**Authorized Redirect URIs:**
```
https://thefastestweb.site/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
```

Old Supabase callback (`https://<ref>.supabase.co/auth/v1/callback`) can be removed.
