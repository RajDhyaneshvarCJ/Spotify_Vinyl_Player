repo: RajDhyaneshvarCJ/Spotify_Vinyl_Player
branch: main
path: (whole repo)

## Last sync

date: 2026-08-18T20:09:31Z

### Updated in this project

- Crate rewritten: one rAF loop drives the sleeves, so touch swipes track the finger and settle with a spring and a flick carries.
- Sleeves are now real boxes — thicker spine, paper top edge, back board, contact shadow, depth-of-field blur — and the spine titles no longer render mirrored.
- Deck gains swipe-to-skip, tap-anywhere-but-the-record to raise the controls (auto-hiding after 3s), and a single floating control panel in focus mode.
- Full screen works on iPad: pinned-viewport fallback where Safari refuses the Fullscreen API, plus a web manifest so the home-screen launch is chromeless. Room colour is dimmed.

## Screen map

| Screen | Repo files |
| --- | --- |
| Shelf / crate | src/CoverFlow.jsx, src/styles.css |
| Deck (player) | src/VinylPlayer.jsx, src/useFullscreen.js, src/styles.css |
| Room colour | src/palette.js, src/App.jsx |
| Shell / home-screen launch | index.html, public/manifest.webmanifest |
| Track list | src/TrackList.jsx (unchanged) |
| Spotify plumbing | src/api.js, src/auth.js, src/usePlayer.js (unchanged) |
