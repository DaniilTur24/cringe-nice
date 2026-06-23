# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Le Grand Суд" — a multiplayer party game with a French-Revolution courtroom theme. Players in a shared "trip" file fines/rewards against each other and vote them up or down; a daily-rolling hidden role (Prosecutor, Judge, Ghost, Oligarch, Detective, or plain Civilian) gives each player a situational power. React + Vite frontend, Supabase (Postgres + Auth + Realtime) backend. Almost all game logic lives in the database, not in JS.

## Commands

```
npm run dev       # Vite dev server
npm run build     # production build
npm run lint      # eslint .
npm run preview   # preview a production build
```

No test suite is configured (no test script, no test files). Verifying a change means running it through the dev server and the actual Supabase project.

Requires a `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key only — no service-role key or DB connection string is kept in this repo).

## Database: migrations vs schema.sql

- `supabase/migrations/000N_*.sql` are incremental, applied-in-order changes (mostly `create or replace function` plus occasional `create table`/`alter`/policy changes).
- `supabase/schema.sql` is a hand-maintained snapshot of the *final* current-state schema, not a generated artifact. When you add a migration, also update `schema.sql` to match — it documents the end state for anyone reading the schema without replaying every migration.
- There is no linked Supabase CLI project and no DB connection string available in this environment. Migrations get applied by hand by pasting SQL into the Supabase Dashboard SQL Editor (Project → SQL Editor → New query). The "Connect" modal for grabbing a connection string has been unreliable; the SQL Editor route needs no password.
- Three branches are in active rotation: `claude` and `codex` are working branches (Claude Code / Codex sessions), `dev` is the integration branch they both get merged into. `codex`'s commits tend to be UI/design polish, `claude`'s tend to be functional/schema changes — check `git log origin/dev..origin/<branch>` before merging to see whether it's a clean fast-forward-style merge or has real conflicts.

## Game rules (the part that requires reading schema.sql to know)

All of this lives in `supabase/schema.sql`'s function definitions, primarily `validate_vote()` and `close_proposal_if_complete()` (both triggers on `public.votes`):

- A `proposal` (type `fine` or `reward`) is voted on by every trip member except its `creator_id` and `target_id`. Voting "Отклонить" = `score = 0`; voting "Согласен" + slider = `-10..-1` (fine) or `1..10` (reward), doubled to `±20` for a Judge with a super-vote charge left.
- Closure triggers once the expected number of voters have all voted (checked on every `votes` insert):
  - If zero-votes are ≥50% of all votes → `status = 'rejected'`. For a fine (and the creator isn't a Ghost), the creator loses 1 point — this is the *only* point at which that penalty applies (not at proposal creation, to preserve anonymity until the outcome is known).
  - Otherwise → `status = 'approved'`, `target_id` gets `round(weighted average of nonzero scores)` (weight 2 for a Prosecutor's doubled vote), stored in `proposals.final_score`. An Oligarch creator gets a 25% cashback on their first 3 approved rewards in a trip.
  - A Judge's super-vote charge (`super_verdict_remaining`) is only decremented on `approved` outcomes (added in migration 0009) — voting with the extended ±20 range no longer burns the charge if the proposal still gets rejected by majority.
- Hidden roles live in `trip_members.role_metadata` (jsonb), assigned by `assign_trip_role()`. They reroll once per day (`assigned_at` date check) and are unique per trip except `civilian`, which is unlimited. Per-role charge counters (`double_vote_count`, `super_verdict_remaining`, `reveals_remaining`, `reward_create_count`) reset on reroll. `src/lib/roles.js` is the UI mirror of this — it must stay in sync with the `v_special_roles` array and the `jsonb_build_object` branches in `assign_trip_role()`.
- A fine's creator identity is anonymous by default. It's auto-revealed to everyone if the proposal is `rejected` (unless the creator is a Ghost, who is excluded from this and from proposal history entirely). A Detective can manually reveal it earlier via `detective_reveal()`, first `scope='self'` (costs a charge), then `scope='all'` (free escalation of an already-self-revealed case).
- `proposals_one_pending_per_trip` (partial unique index) means only one proposal can be `pending` per trip at a time — enforced in Postgres, not just in the UI, so two concurrent submissions race safely.

## Frontend architecture

- `src/Onboarding.jsx` is a single state-machine component driving the whole pre-game flow (`step` state: `loading → email → otp → dashboard → create-trip/role-wheel/invite-link/join/manifest → ready`). A `trip_id` query param means a deliberate invite link and routes straight into that trip (or to `join` if not yet a member); without one, the user lands on `Dashboard` since they may belong to several trips.
- `src/Dashboard.jsx` lists a user's trips (active vs. finished/cancelled) and lets the admin create/finish/cancel/delete or a member leave.
- `src/Courtroom.jsx` is the live game screen for one trip: it keeps every still-`pending` proposal in a list (not just the latest), shows a vote card to eligible voters, queues `VerdictPopup`s as proposals resolve, and renders the leaderboard + history below.
- Hidden-role state (`useTripRole`) and per-trip leaderboard state (`useTripMembers`) are realtime-subscribed (`postgres_changes` on `trip_members`) so charge counters and scores update live without a refresh. `Courtroom` similarly subscribes to `proposals` INSERT/UPDATE to learn about new proposals and verdicts as the DB trigger resolves them — there's no client-side vote-counting logic, the client just reacts to status flips the database already decided.
- Almost no business logic exists client-side: components mostly do Supabase queries/mutations and render. The exception is privileged operations exposed as `security definer` Postgres functions (`assign_trip_role`, `detective_reveal`) called via RPC.
- Styling: Tailwind with a custom palette/shadow set in `tailwind.config.js` (colors `ink`, `cream`, `french-blue`, `juicy-red`, etc.; `shadow-neo*` for the chunky bordered-card look) plus a few hand-rolled utility classes like `panel-label` used throughout for the all-caps section labels.
