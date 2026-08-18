import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgress } from './usePlayer.js'
import { useFullscreen } from './useFullscreen.js'
import ScrollingText from './ScrollingText.jsx'

const LINGER_MS = 3000

function clock(ms) {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The deck.
 *
 * Honest note on the illusion: the Web Playback SDK hands us position and
 * duration, not an audio stream. The disc spins on a fixed loop and the tonearm
 * is driven purely by elapsed-time ratio - it reads as a real turntable because
 * those are the two cues people actually watch.
 *
 * Fullscreen ("focus mode") drops the sleeve entirely and centres the record at
 * the largest size the viewport allows. Everything else fades out until you
 * move the pointer.
 */
export default function VinylPlayer({ state, controls, onBack, contextName }) {
  const track = state?.track_window?.current_track
  const { position, duration, ratio } = useProgress(state)
  const paused = state?.paused ?? true
  const cover = track?.album?.images?.[0]?.url

  const deckRef = useRef(null)
  const fullscreen = useFullscreen(deckRef)

  // One transient controls both the scrubber and, in focus mode, all chrome:
  // it surfaces on deliberate interaction, then gets out of the way so the
  // record is the only thing on screen.
  const [chromeUp, setChromeUp] = useState(false)
  const hideTimer = useRef(null)

  const reveal = useCallback(() => {
    setChromeUp(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setChromeUp(false), LINGER_MS)
  }, [])

  // Surface it whenever the song changes or play/pause flips.
  useEffect(() => {
    if (!track) return
    reveal()
  }, [track?.id, paused, reveal])

  // In focus mode the pointer itself wakes the chrome, the way a video player
  // behaves. Windowed, that would be noisy, so it is scoped to fullscreen.
  useEffect(() => {
    if (!fullscreen.active) return
    const node = deckRef.current
    if (!node) return
    node.addEventListener('pointermove', reveal)
    return () => node.removeEventListener('pointermove', reveal)
  }, [fullscreen.active, reveal])

  useEffect(() => () => clearTimeout(hideTimer.current), [])

  // Space toggles playback, F toggles focus mode - but only when the user
  // isn't focused on the scrubber, where Space belongs to the slider.
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        controls.toggle()
        reveal()
      }
      if (e.key.toLowerCase() === 'f') fullscreen.toggle()
      if (e.key === 'ArrowRight') {
        controls.next()
        reveal()
      }
      if (e.key === 'ArrowLeft') {
        controls.previous()
        reveal()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controls, fullscreen, reveal])

  const handleDiscClick = () => {
    controls.toggle()
    reveal()
  }

  // Tonearm geometry. The pivot sits at the record's top-right corner and the
  // arm hangs down from it, so POSITIVE rotation swings the head inward across
  // the disc — the previous negative angles were sweeping it off to the right,
  // which is why the arm was floating in empty space.
  //
  // With an arm ~62% of the disc's width, 8deg puts the head on the outer
  // groove and 30deg lands it just outside the label. Resting angle parks it
  // clear of the record entirely.
  const ARM_OUTER_DEG = 8
  const ARM_INNER_DEG = 30
  const ARM_REST_DEG = -6
  const armAngle = !track || paused
    ? ARM_REST_DEG
    : ARM_OUTER_DEG + ratio * (ARM_INNER_DEG - ARM_OUTER_DEG)

  if (!track) {
    return (
      <div className="deck deck-empty" ref={deckRef}>
        <p>Nothing on the platter. Pick a record from the shelf.</p>
        <button className="ghost-button" onClick={onBack}>
          Back to shelf
        </button>
      </div>
    )
  }

  const deckClass = [
    'deck',
    fullscreen.active ? 'is-focus' : '',
    chromeUp ? 'chrome-up' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={deckClass} ref={deckRef}>
      <div className="deck-controls">
        {!fullscreen.active && (
          <button className="ghost-button" onClick={onBack}>
            Back to shelf
          </button>
        )}
        {fullscreen.supported && (
          <button
            className="icon-button deck-focus-toggle"
            onClick={fullscreen.toggle}
            aria-pressed={fullscreen.active}
            aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
            title={fullscreen.active ? 'Exit full screen (F)' : 'Full screen (F)'}
          >
            <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
              {fullscreen.active ? (
                // Arrows pointing in: collapse.
                <path
                  d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                // Arrows pointing out: expand.
                <path
                  d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </button>
        )}
      </div>

      <div className="deck-stage">
        {/* Disc sits behind and right of the sleeve - the "record pulled
            halfway out of the jacket" pose. In focus mode the sleeve drops
            away and this centres. */}
        <div className="platter">
          <button
            className={`disc${paused ? ' is-paused' : ''}`}
            style={{ backgroundImage: cover ? `url(${cover})` : undefined }}
            onClick={handleDiscClick}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            <span className="disc-grooves" />
            <span className="disc-label">
              <span className="disc-label-text">{track.name}</span>
              <span className="disc-spindle" />
            </span>
            {/* Only shown while paused, so the still record reads as stopped
                rather than broken. */}
            <span className="disc-cue" aria-hidden="true">&#9654;</span>
          </button>
        </div>

        {/* key= forces a remount on track change so the sleeve slides in fresh */}
        <div className="sleeve-large" key={track.id}>
          {cover ? <img src={cover} alt="" /> : <div className="sleeve-blank" />}
        </div>

        {/* The arm gets its own layer, tracking the platter's box exactly.
            It cannot live inside .platter: the arm must paint above the record
            while the record stays tucked BEHIND the sleeve, and a child can
            never escape its parent's stacking order. */}
        <div className="tonearm-layer" aria-hidden="true">
          <div className="tonearm" style={{ transform: `rotate(${armAngle}deg)` }}>
            <span className="tonearm-pivot" />
            <span className="tonearm-shaft" />
            <span className="tonearm-head" />
          </div>
        </div>
      </div>

      <div className="deck-meta">
        {contextName && <p className="deck-context">{contextName}</p>}
        <h1 className="deck-title">
          <ScrollingText text={track.name} />
        </h1>
        <p className="deck-artist">
          <ScrollingText text={track.artists?.map((a) => a.name).join(', ') || ''} />
        </p>
      </div>

      <div className="transport" onPointerDown={reveal} onFocus={reveal}>
        <button
          onClick={() => {
            controls.previous()
            reveal()
          }}
          aria-label="Previous track"
          title="Previous track"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M18 5v14L8 12l10-7zM6 5h2v14H6z" fill="currentColor" />
          </svg>
        </button>

        <button
          className="transport-play"
          onClick={handleDiscClick}
          aria-label={paused ? 'Play' : 'Pause'}
          title={paused ? 'Play (Space)' : 'Pause (Space)'}
        >
          {paused ? (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M8 5v14l11-7z" fill="currentColor" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
            </svg>
          )}
        </button>

        <button
          onClick={() => {
            controls.next()
            reveal()
          }}
          aria-label="Next track"
          title="Next track"
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 5l10 7L6 19V5zM16 5h2v14h-2z" fill="currentColor" />
          </svg>
        </button>
      </div>

      <div className="scrubber" onPointerDown={reveal} onFocus={reveal}>
        <span className="scrubber-time">{clock(position)}</span>
        <input
          type="range"
          min="0"
          max={duration}
          value={position}
          onChange={(e) => {
            controls.seek(Number(e.target.value))
            reveal()
          }}
          aria-label="Playback position"
        />
        <span className="scrubber-time">{clock(duration)}</span>
      </div>
    </div>
  )
}
