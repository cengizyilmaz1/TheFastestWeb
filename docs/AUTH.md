# Authentication — current implementation

The active app uses **next-auth 4.24.15**, the stable release selected for M1. The previous v5 beta migration notes are superseded by this document. Supabase Auth and Vercel proxy workarounds are not dependencies.

1. The browser starts Google sign-in with NextAuth's CSRF protection.
2. Google returns to `SITE_URL/api/auth/callback/google`. Register this exact HTTPS URI in the new Google Cloud OAuth client.
3. NextAuth validates OAuth state and PKCE. The callback accepts only Google with a verified email.
4. User synchronization serializes the normalized email lookup. Existing users keep their exact database UUID and site ownership. Profile name/avatar may update from the verified Google profile.
5. The JWT stores the internal UUID; subsequent resource handlers validate the session and database ownership.
6. A database failure denies sign-in. Email delivery never participates in sign-in.

Runtime startup maps validated `AUTH_SECRET` and `AUTH_URL`/`SITE_URL` to NextAuth4's expected environment. Production uses a single HTTPS origin and a controlled reverse proxy. The app cannot establish proxy trust merely from request headers.

Rotating the Auth secret and changing the session implementation requires users to sign in again. It does **not** regenerate user IDs or recreate their sites. Database tests prove UUID/ownership preservation; final sign-in with an existing real Google account still requires the new OAuth credentials and deployed callback.

No account/password migration, access-token persistence or unverified email linking has been introduced. Provider tokens and emails must never be logged.
