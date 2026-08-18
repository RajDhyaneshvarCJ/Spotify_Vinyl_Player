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
record is the only thing on screen. Move the mouse or click the record to bring
them back.


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
