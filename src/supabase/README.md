# Connecting CloudX Global to Supabase

The app already talks to Supabase for sign-in, clients, invoices, quotations, payments, maintenance and
settings. Until the two environment variables below are set it runs in a clearly-labelled **local preview**
(sidebar says "Not synced to server") and nothing is saved to a database.

## 1. Create the project
1. https://supabase.com → **New project** (pick the region closest to Sri Lanka, e.g. Singapore or Mumbai).
2. Keep the database password somewhere safe.

## 2. Create the tables, security rules and storage
Supabase dashboard → **SQL Editor** → run these files **in this order**, one at a time
(open the file, paste, **Run**):

1. `migrations/20261025000001_schema.sql`
2. `migrations/20261025000002_security.sql`
3. `migrations/20261025000003_functions.sql`
4. `migrations/20261031000004_director_signatures.sql`  ← new: director signatures

## 3. Create the three director logins
1. **Authentication → Users → Add user → Create new user.** Create one account per director
   (email + password, tick **Auto Confirm User**).
2. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new users to sign up",
   so nobody else can register.
3. Open `seed_directors.sql`, replace the three example emails, names and titles with the real ones
   (emails must match the accounts you just created), paste it into the SQL Editor and **Run**.
   This creates the company workspace and links the three directors. It is safe to run again.

## 4. Connect the app
Project Settings → **API** → copy the **Project URL** and the **anon public** key.

Local development: copy `.env.example` to `.env` in the **project root** (the same folder as `package.json` and `vite.config.ts` — NOT inside `src/`) and fill in
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```
Vercel: Project → Settings → **Environment Variables** → add the same two variables → **Redeploy**.

After creating or editing `.env`, stop the dev server (Ctrl+C) and run `npm run dev` again — Vite only reads `.env` at start-up.

Never put the `service_role` key in the app or in a `VITE_` variable.

## 5. Password-reset links
Authentication → **URL Configuration**: set **Site URL** to your Vercel address and add
`https://your-app.vercel.app/reset-password` to **Redirect URLs**.

## 6. First sign-in
Each director signs in, then opens **Settings → Users & access** and:
* checks their display name and designation (the dashboard greets them by this name), and
* draws or uploads their signature.

From then on every invoice / quotation they create prints their own signature above their name.

## Optional: invite more people later
`functions/invite-director` sends the invitation email using the service-role key on the server:
```
supabase functions deploy invite-director
supabase secrets set SITE_URL=https://your-app.vercel.app
```
