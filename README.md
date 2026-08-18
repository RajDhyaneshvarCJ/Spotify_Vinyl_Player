# Vinyl

Your Spotify library as a crate of records. Runs on your own machine, plays in
the browser.

Three screens:

1. **Shelf** - your albums and playlists fanned out in 3D. Flick through them.
2. **Sleeve** - the track list for whichever record you picked.
3. **Deck** - the record spins, the tonearm follows the song.


## What you need first

- A Spotify account with **Premium**. Playback in the browser will not work on a
  free account.
- Node.js installed (version 18 or newer).


## Setup

### Step 1: Register the app with Spotify

Go to https://developer.spotify.com/dashboard and create an app.

Fill in these settings:

| Setting | Value |
| --- | --- |
| Redirect URI | `http://127.0.0.1:5173/callback` |
| APIs used | Tick both **Web API** and **Web Playback SDK** |

The redirect URI has to match exactly. Two things trip people up here:

- Use `127.0.0.1`, not `localhost`. Spotify stopped accepting `localhost`.
- No trailing slash.

Then open **Settings**, then **User Management**, and add your own Spotify
account. Development Mode only lets allowlisted accounts in, so without this
step every request comes back as a 403 error even though the app is yours. You
get five slots.

Finally, copy the **Client ID** from the settings page. You will need it next.

### Step 2: Add your Client ID

```bash
cp .env.example .env
```

Open `.env` and paste your Client ID after `VITE_SPOTIFY_CLIENT_ID=`.

### Step 3: Run it

```bash
npm install
npm run dev
```

Open http://127.0.0.1:5173 in your browser. Again, `127.0.0.1` and not
`localhost`, or the login redirect will not match.


## Controls

| What you want | How to do it |
| --- | --- |
| Move through the crate | Scroll, drag, or press the left and right arrow keys |
| Open a record | Click the cover in the middle, or press Enter |
| Play from a track | Click any row in the track list |
| Play or pause | Click the record itself, or press Space |
| Skip tracks | The transport buttons, or arrow keys on the deck |
| Go full screen | The expand icon, or press F |
| Leave full screen | Press Escape or F, or click the icon again |

On the deck, the progress bar and buttons fade out after three seconds so the
cover and record are the only things on screen. Move the mouse or click the
record to bring them back.

Full screen shows the same cover and record, larger, with everything except the
progress bar removed. Click the record to play or pause, use the arrow keys to
skip, and press Escape or F to come back out.


## Putting it on an iPad

Running the dev server and typing your Mac's local IP into the iPad will not
work. Spotify only accepts redirect URIs that are either `https://` or the
loopback address `127.0.0.1`. A plain `http://192.168.x.x` address is rejected,
so the login will fail before you get anywhere.

You need an HTTPS address. Two ways to get one.

### Option A: deploy it (recommended)

Free static hosts will give you an HTTPS URL. Vercel, Netlify, and Cloudflare
Pages all work, and the app is a plain static build.

1. Push the project to a Git repository, or use the host's CLI to upload it.
2. Set the build command to `npm run build` and the output directory to `dist`.
3. Add `VITE_SPOTIFY_CLIENT_ID` as an environment variable in the host's
   dashboard. Add `VITE_REDIRECT_URI` too, set to your deployed URL plus
   `/callback`, for example `https://vinyl-yourname.vercel.app/callback`.
4. Back in the Spotify dashboard, add that same callback URL as a second
   Redirect URI. You can keep the `127.0.0.1` one for local work.
5. Open the URL on the iPad in Safari.

The app is only usable by the accounts on your allowlist, so a public URL does
not mean public access. Anyone else who visits will get a 403.

### Option B: a temporary tunnel

If you only want it on the iPad occasionally and would rather not deploy, a
tunnel gives your local server a temporary HTTPS address. Cloudflare Tunnel and
ngrok both do this. You will need to add the tunnel's URL as a Redirect URI each
time it changes, which is why this suits occasional use rather than daily use.

### Making it feel like an app

In Safari on the iPad, tap the share button and choose **Add to Home Screen**.
It then launches without the address bar and fills the screen.

### What to expect on iOS

Playback works, but Apple restricts audio more tightly than desktop browsers:

- Sound only starts from a tap. The app handles this by requesting audio
  permission the moment you tap a track or the record, so it should be
  invisible to you. If a track ever loads paused, tap the record.
- Volume cannot be set from the page. Use the iPad's own volume buttons.
- Audio stops when you switch apps or lock the screen. Browser audio does not
  keep playing in the background the way the real Spotify app does.

That last one is a limit of the browser, not something this app can fix. If
background playback matters to you, the official Spotify app is the answer.


## About the .env file

This app signs in using OAuth with PKCE, which is built for apps that have no
backend server. There is no client secret involved at any point, so nothing
confidential ends up in the code.

One thing worth understanding: any variable starting with `VITE_` is readable in
the built JavaScript. That is fine for a Client ID, which Spotify treats as
public information. It would not be fine for a real secret, so do not add one.

`.env` is listed in `.gitignore` and will not be committed.


## When something goes wrong

**The login page says INVALID_CLIENT or the redirect fails.**
The redirect URI in `.env` does not match the one in the Spotify dashboard.
Check for `localhost` instead of `127.0.0.1`, a trailing slash, or a different
port number.

**A playlist opens but the track list fails with a 403 error.**
Spotify only returns the contents of playlists you own or collaborate on.
Someone else's playlist, including Spotify's own editorial ones, will show its
cover and name but no tracks. There is no way around this from the app side.

**Every request fails with a 403 error.**
Your account is not in the app's User Management allowlist, or it is not
Premium. Both are required.

**Nothing plays and there is no error.**
The account you signed in with is probably not Premium. The Web Playback SDK
refuses to stream on free accounts.

**It says "No active device found".**
The browser player had not finished connecting to Spotify when you pressed play.
Wait a couple of seconds and try again. The app already retries once by itself.

**The covers load but the background stays a dull plum colour.**
The app reads the album artwork to tint the background, which needs permission
headers from Spotify's image servers. If that fails it quietly falls back to a
default colour rather than breaking.


## A note on the Spotify API

Spotify tightened access to its Web API in early 2026. Some endpoints were
removed, library endpoints were reorganised, and search results were capped.

This app only uses saved albums, playlists, track lists, and playback control.
It reads playlist contents from `/playlists/{id}/items`, which replaced the
older `/tracks` endpoint in that migration. The old one now returns 403 for
every Development Mode app.

If a request suddenly starts failing, check the current documentation at
https://developer.spotify.com/documentation/web-api before assuming it is a bug
in this code. The rules here change more often than the code does.


## What is real and what is illusion

Worth knowing so nothing surprises you later.

The record spins and the tonearm moves across it, but neither is reacting to the
actual audio. Spotify's playback SDK gives this app the track position and
length, not the sound itself. So the disc turns on a fixed loop and the arm is
positioned purely from how far through the song you are.

It reads as a real turntable because those are the two things people actually
watch. But if you ever want the record to genuinely pulse with the music, that
would need a different approach, and the Spotify SDK cannot provide it.


Made with ♥ using Claude.
