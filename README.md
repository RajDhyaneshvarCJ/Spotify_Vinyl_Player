# Vinyl

Your Spotify library as a crate of records. Runs locally, plays in the browser.

Two views: a **shelf** of covers fanned in 3D that you flick through, and a **deck**
where the record spins and the tonearm tracks the song.

---

## Setup

### 1. Register the app on Spotify

At <https://developer.spotify.com/dashboard>, create an app and set:

- **Redirect URI** — `http://127.0.0.1:5173/callback`
  Exactly that. Spotify no longer accepts `localhost` as a redirect host, and the
  string must match character for character or you'll get `INVALID_CLIENT`.
- **APIs used** — tick both **Web API** and **Web Playback SDK**.

Then, under **Settings → User Management**, add your own Spotify account. In
Development Mode only allowlisted accounts can use the app — everyone else gets
403s. You get five slots.

Copy the **Client ID** from the settings page.

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` and paste your Client ID into `VITE_SPOTIFY_CLIENT_ID`.

`.env` is gitignored. Note that this app uses OAuth **PKCE**, which is designed
for browser apps with no backend — there is no client secret involved anywhere,
so nothing confidential ends up in the bundle. (Be aware that any `VITE_`
variable *is* readable in the built JS. That's fine for a Client ID, which
Spotify treats as public, but don't put real secrets in there.)

### 3. Run

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:5173> — not `localhost`, or the redirect won't match.

---

## Using it

| Action | How |
| --- | --- |
| Move through the crate | Scroll, drag, or ← → |
| Play the record in focus | Click it, or Enter |
| Switch Albums / Playlists | Toggle at the top |
| Jump back to the deck | Mini bar at the bottom |
| Open a record's track list | Click the centred cover, or Enter |
| Play from a track | Click any row in the list |
| Play / pause | Click the record, or Space |
| Next / previous track | Transport buttons, or arrow keys on the deck |
| Full screen (record only) | **Full screen** button, or F |
| Leave full screen | Esc, F, or the button |

In full screen the sleeve drops away, the record scales to fill the viewport,
and all controls plus the cursor fade out after three seconds. Move the pointer
to bring them back.

---

## Requirements

- **Spotify Premium** on the account you sign in with. The Web Playback SDK will
  not stream on a free account — it throws an account error and nothing plays.
- Since February 2026, the account that *registers* the developer app must also
  be Premium.
- Chrome, Edge, Firefox, or Safari. The SDK uses Encrypted Media Extensions, so
  some hardened/privacy browser configurations will block playback.

---

## If something breaks

**`INVALID_CLIENT: Invalid redirect URI`** — the URI in `.env` doesn't byte-match
the dashboard. Check for `localhost` vs `127.0.0.1`, a stray trailing slash, and
the port.

**403 on every request** — the account isn't in the app's User Management
allowlist, or isn't Premium.

**"No active device found" / nothing plays** — the SDK device hadn't registered
yet when you hit play. Wait for it to connect and try again; the app calls
`transferPlayback` before every play to claim the device.

**Covers load but the background stays plum** — colour extraction reads pixels
off a canvas, which needs CORS headers from Spotify's image CDN. It falls back
silently rather than crashing.

---

## Worth knowing about the API surface

Spotify tightened Web API access in February–March 2026: several endpoint
families were removed, library endpoints were consolidated, and search results
were capped at 10. This app sticks to saved albums, playlists, album/playlist
tracks, and player control — but if a call starts 404ing, check the current
reference at <https://developer.spotify.com/documentation/web-api> rather than
assuming it's a bug in the code. I'd rather you verify against live docs than
trust my memory of an endpoint shape.
