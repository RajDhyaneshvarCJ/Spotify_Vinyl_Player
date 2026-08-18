import { useCallback, useEffect, useState } from 'react'
import { completeLogin, configError, hasSession, login, logout } from './auth.js'
import {
  getContextTracks,
  getPlaylists,
  getSavedAlbums,
  playContext,
  transferPlayback,
} from './api.js'
import { usePlayer } from './usePlayer.js'
import { extractPalette } from './palette.js'
import { needleDrop } from './needle.js'
import CoverFlow from './CoverFlow.jsx'
import TrackList from './TrackList.jsx'
import VinylPlayer from './VinylPlayer.jsx'

export default function App() {
  const [signedIn, setSignedIn] = useState(hasSession())
  const [booting, setBooting] = useState(true)
  const [tab, setTab] = useState('albums')
  const [library, setLibrary] = useState({ albums: [], playlists: [] })
  const [index, setIndex] = useState(0)
  const [view, setView] = useState('shelf')
  const [nowPlayingName, setNowPlayingName] = useState(null)
  const [selected, setSelected] = useState(null)
  const [tracks, setTracks] = useState([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [tracksError, setTracksError] = useState(null)
  const [palette, setPalette] = useState(['#33191f', '#180d10'])
  const [error, setError] = useState(configError())
  const [starting, setStarting] = useState(false)

  const { deviceId, state, error: playerError, ...controls } = usePlayer(signedIn)

  // --- Handle the OAuth redirect before anything else renders -------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const denied = params.get('error')

    if (denied) {
      setError('Spotify login was cancelled.')
      window.history.replaceState({}, '', '/')
      setBooting(false)
      return
    }

    if (code) {
      completeLogin(code)
        .then(() => setSignedIn(true))
        .catch((e) => setError(e.message))
        .finally(() => {
          window.history.replaceState({}, '', '/')
          setBooting(false)
        })
      return
    }
    setBooting(false)
  }, [])

  // --- Load the library once we have a session ----------------------------
  useEffect(() => {
    if (!signedIn) return
    let alive = true
    Promise.all([getSavedAlbums(), getPlaylists()])
      .then(([albums, playlists]) => alive && setLibrary({ albums, playlists }))
      .catch((e) => alive && setError(e.message))
    return () => {
      alive = false
    }
  }, [signedIn])

  const items = tab === 'albums' ? library.albums : library.playlists

  // --- Tint the room from whatever cover is in focus ----------------------
  const focusArt =
    view === 'deck'
      ? state?.track_window?.current_track?.album?.images?.[0]?.url
      : view === 'tracks'
        ? selected?.image
        : items[index]?.image

  useEffect(() => {
    let alive = true
    // Debounced: a fast swipe crosses half a dozen covers, and each one would
    // otherwise mean a canvas read plus a full-screen gradient repaint mid-
    // gesture. Waiting for the crate to settle keeps the swipe smooth and the
    // room colour still lands before you've finished looking at the record.
    const id = setTimeout(() => {
      extractPalette(focusArt).then((p) => alive && setPalette(p))
    }, 180)
    return () => {
      alive = false
      clearTimeout(id)
    }
  }, [focusArt])

  // Picking a record off the shelf opens its track list rather than playing
  // immediately — choosing the record and choosing the track are separate acts.
  const handleSelect = useCallback(async (item) => {
    setSelected(item)
    setView('tracks')
    setTracks([])
    setTracksError(null)
    setTracksLoading(true)
    try {
      setTracks(await getContextTracks(item))
    } catch (e) {
      setTracksError(e.message)
    } finally {
      setTracksLoading(false)
    }
  }, [])

  const handlePlayIndex = useCallback(
    async (offsetIndex) => {
      if (!selected) return
      if (!deviceId) {
        setError('Player is still connecting to Spotify. Give it a moment.')
        return
      }
      // First thing, before any await: on iOS this is what buys permission to
      // make sound at all. Yielding first would forfeit the gesture.
      controls.activate?.()
      needleDrop()

      setError(null)
      setStarting(true)
      try {
        // Claim playback first — without an active device, play returns 404.
        await transferPlayback(deviceId, false)

        // Spotify needs a beat to register the transfer. Firing `play`
        // immediately after often 404s on a device it just acknowledged, so
        // retry once after a short pause rather than surfacing a scary error
        // for what is really just a timing gap.
        try {
          await playContext(deviceId, selected.uri, offsetIndex)
        } catch {
          await new Promise((r) => setTimeout(r, 700))
          await playContext(deviceId, selected.uri, offsetIndex)
        }

        setNowPlayingName(selected.name)
        setView('deck')
      } catch (e) {
        setError(e.message)
      } finally {
        setStarting(false)
      }
    },
    [deviceId, selected]
  )

  // Exposed as a custom property too, so the fullscreen deck can paint itself
  // the same colour - a fullscreen element renders against black otherwise.
  //
  // The cover's colour is now a tint on a dark room rather than the room itself:
  // the extracted pair is capped darker in palette.js and a scrim sits over the
  // gradient. On a bright sleeve the old version lit the whole screen up, which
  // is exactly what you don't want from a record player in a dim room.
  const room =
    `linear-gradient(rgba(0, 0, 0, 0.24), rgba(0, 0, 0, 0.46)), ` +
    `radial-gradient(116% 96% at 50% 0%, ${palette[0]} 0%, ${palette[1]} 56%, #0a0709 100%)`
  const backdrop = { background: room, '--room': room }

  if (booting) {
    return (
      <div className="app" style={backdrop}>
        <div className="centered">Warming up…</div>
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="app" style={backdrop}>
        <div className="centered gate">
          <h1 className="wordmark">Vinyl</h1>
          <p>Your Spotify library, as a crate of records.</p>
          <button className="solid-button" onClick={login} disabled={Boolean(configError())}>
            Connect Spotify
          </button>
          {error && <p className="error">{error}</p>}
          <p className="fineprint">Needs a Spotify Premium account with playback permissions.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app" style={backdrop}>
      <header className="topbar">
        <div className="segmented" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'albums'}
            className={tab === 'albums' ? 'is-on' : ''}
            onClick={() => {
              setTab('albums')
              setIndex(0)
            }}
          >
            Albums
          </button>
          <button
            role="tab"
            aria-selected={tab === 'playlists'}
            className={tab === 'playlists' ? 'is-on' : ''}
            onClick={() => {
              setTab('playlists')
              setIndex(0)
            }}
          >
            Playlists
          </button>
        </div>

        <button
          className="ghost-button topbar-right"
          onClick={() => {
            logout()
            setSignedIn(false)
          }}
        >
          Sign out
        </button>
      </header>

      {(error || playerError) && <p className="error banner">{error || playerError}</p>}

      {view === 'shelf' && !deviceId && (
        <p className="status-pill">Connecting player to Spotify…</p>
      )}
      {starting && <p className="status-pill">Dropping the needle…</p>}

      {view === 'shelf' &&
        (items.length ? (
          <CoverFlow items={items} index={index} onIndex={setIndex} onSelect={handleSelect} />
        ) : (
          <div className="centered">
            <p>No saved {tab} yet. Save some in Spotify and reload.</p>
          </div>
        ))}

      {view === 'tracks' && selected && (
        <TrackList
          item={selected}
          tracks={tracks}
          loading={tracksLoading}
          error={tracksError}
          currentTrackId={state?.track_window?.current_track?.id}
          onPlayIndex={handlePlayIndex}
          onBack={() => setView('shelf')}
        />
      )}

      {view === 'deck' && (
        <VinylPlayer
          state={state}
          controls={controls}
          contextName={nowPlayingName}
          onBack={() => setView(selected ? 'tracks' : 'shelf')}
        />
      )}

      {view !== 'deck' && state?.track_window?.current_track && (
        <button className="mini-bar" onClick={() => setView('deck')}>
          <span className="mini-disc" />
          <span className="mini-text">
            <strong>{state.track_window.current_track.name}</strong>
            <em>{state.track_window.current_track.artists?.map((a) => a.name).join(', ')}</em>
          </span>
          <span className="mini-cta">Open deck</span>
        </button>
      )}
    </div>
  )
}
