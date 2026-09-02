# Rebuilding the Supabase project from scratch

The original project (`fjwvdbrlhkywqpfurzim`) is gone. Everything below
recreates the backend. Work top to bottom — the auth step is the one people
forget, and the app will not sign anyone in without it.

## What is lost, and what is not

**Lost, permanently:** every user account, every coin registration, all session
history, streaks and XP. There is no export to recover — the project is gone.

**Not lost:** the entire schema. Every table, function and policy is in
`supabase/migrations/`, so the backend rebuilds exactly.

Practical effect: everyone (you included) signs up again and re-registers their
three coins. Pre-launch that costs a few minutes. After launch it would be a
disaster — see "Never again" at the bottom.

## 1. Create the project

1. https://supabase.com/dashboard → **New project**
2. Name: `rise` (or similar)
3. **Database password** — generate a strong one and save it in a password
   manager now. It cannot be retrieved later, only reset.
4. Region: closest to your users
5. **Plan: Pro.** On Free the project pauses after ~7 days of inactivity, which
   is exactly what took the app down twice today. Do not launch on Free.

Wait for provisioning (~2 minutes).

## 2. Create the schema

**SQL Editor** → New query → paste the whole of `supabase/rebuild_all.sql`
→ **Run**.

That file is the 12 migrations concatenated in order. It is idempotent, so
re-running it is harmless.

Expect: `Success. No rows returned`.

Verify in **Table Editor** — you should see 8 tables:

    activation_codes   coins      friend_links   profiles
    sessions           shifts     user_stats     user_status

## 3. Configure Auth (required — do not skip)

**Authentication → URL Configuration**

- **Redirect URLs** → add exactly:

      risemobile://auth/callback

  Without this, Google and Apple sign-in complete in the browser and then fail
  to return to the app.

**Authentication → Providers**

| Provider | Action |
|---|---|
| **Email** | On by default. Decide whether "Confirm email" stays on — if it is on, test accounts must click a link before they can sign in. |
| **Google** | Needs a Google Cloud OAuth client ID + secret. |
| **Apple** | Needs Services ID, Team ID, Key ID and the `.p8` private key from the Apple Developer portal. |

The app shows both OAuth buttons on the login screen. Any provider you leave
disabled will error when tapped — either configure it or the button needs
hiding before release.

## 4. Test data (optional, dev only)

**SQL Editor** → paste `supabase/seed.sql` → Run.

Creates four accounts (`ada` / `linus` / `grace` / `alan` @rise.test, password
`risetest123`) with coins, 14 days of history, squad links in every state and
live statuses. Sign in as **ada@rise.test** — she has all three coins, a
14-day streak, two friends and a pending request.

**Never run this against production.** It deletes and recreates those users.

## 5. Point the app at the new project

**Project Settings → API**, copy:

- **Project URL** → `SUPABASE_URL`
- **anon / public** key → `SUPABASE_ANON_KEY`

Edit `.env`:

    SUPABASE_URL=https://<new-ref>.supabase.co
    SUPABASE_ANON_KEY=<new anon key>

Never put the **service_role** key in `.env` — it bypasses every security
policy and would ship inside the app binary.

## 6. Rebuild the apps — a Metro reload is not enough

`react-native-config` compiles these values into the native binary, so JS
reload will keep using the old dead project.

    npm run ios
    npm run android

## 7. Verify

1. App opens on the login screen (not the "Env setup" screen) — config loaded.
2. Sign up with a new email → reach the main screen.
3. Settings → Account shows a **Squad code** — proves migration 011 ran.
4. Squad tab loads without "Could not refresh" — proves the RPCs exist.
5. Run a short block → End Shift → Grand Finale shows XP, and Total XP on the
   main page increases — proves migration 012 ran.

## Never again

- **Pro plan** stops the auto-pause that caused this.
- **Database → Backups**: Pro gives daily backups; enable Point-in-Time
  Recovery if the data matters.
- Record the new project ref somewhere outside Supabase.
- Check who has dashboard access — a project does not delete itself.
- Consider a second "staging" project so tests never touch production.
