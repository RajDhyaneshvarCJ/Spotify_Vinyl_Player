import { useEffect, useRef, useState } from 'react'
import { getAccessToken } from './auth.js'

/**
 * Wraps the Spotify Web Playback SDK.
 *
 * Two things worth knowing:
 *  1. The SDK script sets a global `onSpotifyWebPlaybackSDKReady` callback. If
 *     the script already loaded before this hook mounts, that callback will
 *     never fire again — so we check for `window.Spotify` first.
 *  2. `player_state_changed` fires on track/pause changes but NOT continuously,
 *     so progress is interpolated locally and re-synced on each event. Polling
 *     the API every frame would blow through the rate limit.
 */
export function usePlayer(enabled) {
  const [deviceId, setDeviceId] = useState(null)
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const playerRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    function init() {
      if (cancelled || playerRef.current) return

      const player = new window.Spotify.Player({
        name: 'Vinyl',
        volume: 0.8,
        getOAuthToken: (cb) => {
          getAccessToken().then((t) => t && cb(t))
        },
      })

      player.addListener('ready', ({ device_id }) => !cancelled && setDeviceId(device_id))
      player.addListener('not_ready', () => !cancelled && setDeviceId(null))
      player.addListener('player_state_changed', (s) => !cancelled && setState(s))

      player.addListener('initialization_error', ({ message }) => setError(message))
      player.addListener('authentication_error', ({ message }) => setError(message))
      player.addListener('account_error', () =>
        setError('Playback needs Spotify Premium on this account.')
      )

      player.connect()
      playerRef.current = player
    }

    if (window.Spotify) init()
    else window.onSpotifyWebPlaybackSDKReady = init

    return () => {
      cancelled = true
      playerRef.current?.disconnect()
      playerRef.current = null
    }
  }, [enabled])

  return {
    deviceId,
    state,
    error,
    toggle: () => playerRef.current?.togglePlay(),
    next: () => playerRef.current?.nextTrack(),
    previous: () => playerRef.current?.previousTrack(),
    seek: (ms) => playerRef.current?.seek(ms),
  }
}

/**
 * Smooth playback position. The SDK's state snapshot goes stale immediately, so
 * we tick locally between events and reset whenever a new snapshot arrives.
 */
export function useProgress(state) {
  const [position, setPosition] = useState(0)

  useEffect(() => {
    if (!state) return
    setPosition(state.position)
    if (state.paused) return

    const startedAt = Date.now()
    const base = state.position
    const id = setInterval(() => {
      setPosition(Math.min(base + (Date.now() - startedAt), state.duration))
    }, 250)
    return () => clearInterval(id)
  }, [state])

  const duration = state?.duration || 1
  return { position, duration, ratio: Math.min(position / duration, 1) }
}
