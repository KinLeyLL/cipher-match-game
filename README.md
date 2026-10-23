# Cipher Match

A realtime team puzzle hunt for company events. Guests join a shared lobby, receive a cropped photo tile when the host starts the game, check in with every teammate, then unlock a three-question collaborative trivia round.

## Run locally

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local` and set the Supabase project URL and anon key.
3. Run `supabase/schema.sql` in the Supabase SQL Editor.
4. In Supabase Authentication, create the event host account. Add that user's ID to `public.event_hosts`:

   ```sql
   insert into public.event_hosts (user_id)
   select id from auth.users where email = 'host@example.com'
   on conflict (user_id) do nothing;
   ```

5. Start the app with `npm run dev`. The host dashboard displays a QR code for the player entry URL.

The app accepts up to 90 players. The start function balances teams into groups of three to five, assigns each a photo and a 2x2 tile, and advances the event only after every player on a team checks in. Each group has one trivia captain so concurrent taps cannot skip questions. Captains share a four-digit team PIN; teammates enter it on their own screens.

## Supabase setup notes

- Enable Email/Password under Authentication providers before creating a host account.
- `schema.sql` enables row-level security, host-only roster access, player RPCs, authenticated host-only game start and flex-completion, a public 300 KB-limited `puzzle-images` bucket with host-only uploads, and Realtime publication for live updates.
- Upload photos in the host dashboard to resize them and compress them below 280 KB before distribution. HTTPS URLs are also supported; use an image CDN that can serve optimized images.
- The host dashboard lists each team's PIN and offers a confirmed **Flex complete** action to advance a team if someone is missing or can't check in. It preserves a checked-in captain or promotes a checked-in teammate if the original captain is absent.
- Do not commit `.env.local`. The browser anon key is expected to be public; the SQL policies and RPCs enforce the permitted operations.
- Run a full event rehearsal with the deployed Supabase project and venue Wi-Fi before inviting participants.

## Dry run

Use a separate Supabase test project for rehearsal. Open four or five private browser sessions, join with different names, and sign in to the host dashboard in a separate window. Start the game and verify each player gets a cropped tile, then share a team's four-digit PIN and check in each teammate. Confirm Phase 2 opens only after the whole team checks in. Finally, test **Flex complete** on another team and confirm its members advance without PIN entry.

## Commands

- `npm run dev` starts the Vite development server.
- `npm run build` type-checks and creates the production bundle.
- `npm run lint` runs Oxlint.
