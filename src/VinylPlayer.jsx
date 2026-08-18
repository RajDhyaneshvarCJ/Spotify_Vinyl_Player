import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgress } from './usePlayer.js'
import { useFullscreen } from './useFullscreen.js'
import { needleDrop, needleLift } from './needle.js'
import ScrollingText from './ScrollingText.jsx'

const LINGER_MS = 3000
// Horizontal travel that commits to the next/previous record.
const SWIPE_COMMIT_PX = 60
// A short, fast flick counts even if it didn't travel that far.
const SWIPE_FLICK = 0.45 // px per ms

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
 * Touch model:
 *   tap the record          – play / pause
 *   tap anywhere else       – bring the controls up for three seconds
 *   swipe left / right      – previous / next, the composition following the
 *                             finger and flying out in the direction you threw it
 *
 * Focus mode centres the record and floats the whole control stack over it.
 */
export default function VinylPlayer({ state, controls, onBack, contextName }) {
  const track = state?.track_window?.current_track
  const { position, duration, ratio } = useProgress(state)
  const paused = state?.paused ?? true
  const cover = track?.album?.images?.[0]?.url

  const deckRef = useRef(null)
  const fullscreen = useFullscreen(deckRef)

  // One transient controls the whole chrome stack: it surfaces on deliberate
  // interaction, then gets out of the way so the record is the only thing there.
  const [chromeUp, setChromeUp] = useState(false)
  const hideTimer = useRef(null)

  // Live swipe feedback + the direction of the last committed swipe.
  const [swipeX, setSwipeX] = useState(0)
  const [fly, setFly] = useState(null) // 'next' | 'prev' | null
  const swipe = useRef(null)
  const swiped = useRef(false)
  const flyTimer = useRef(null)
  const seeking = useRef(false)

  const reveal = useCallback(() => {
    setChromeUp(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setChromeUp(false), LINGER_MS)
  }, [])

  const hideChrome = useCallback(() => {
    clearTimeout(hideTimer.current)
    setChromeUp(false)
  }, [])

  // A bare tap toggles: up if it was down, away if it was up. The three-second
  // timer still runs, so ignoring it also puts the record back on its own.
  const toggleChrome = useCallback(() => {
    if (chromeUp) hideChrome()
    else reveal()
  }, [chromeUp, hideChrome, reveal])

  // Play drops the needle; pause lifts it.
  const play = useCallback(() => {
    controls.activate?.()
    if (paused) needleDrop()
    else needleLift()
    controls.toggle()
    reveal()
  }, [controls, paused, reveal])

  // Surface it whenever the song changes or play/pause flips.
  useEffect(() => {
    if (!track) return
    reveal()
  }, [track?.id, paused, reveal])

  // A mouse moving wakes the chrome the way a video player does. Scoped to
  // focus mode: windowed, every stray cursor drift would flash the controls.
  useEffect(() => {
    if (!fullscreen.active) return
    const node = deckRef.current
    if (!node) return
    const onMove = (e) => {
      if (e.pointerType === 'mouse') reveal()
    }
    node.addEventListener('pointermove', onMove)
    return () => node.removeEventListener('pointermove', onMove)
  }, [fullscreen.active, reveal])

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current)
      clearTimeout(flyTimer.current)
    },
    []
  )

  const skip = useCallback(
    (dir) => {
      controls.activate?.()
      if (dir === 'next') controls.next()
      else controls.previous()
      setFly(dir)
      clearTimeout(flyTimer.current)
      flyTimer.current = setTimeout(() => setFly(null), 460)
      reveal()
    },
    [controls, reveal]
  )

  // Space toggles playback, F toggles focus mode - but only when the user
  // isn't focused on the scrubber, where Space belongs to the slider.
  useEffect(() => {
    function onKey(e) {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') {
        e.preventDefault()
        play()
      }
      if (e.key.toLowerCase() === 'f') fullscreen.toggle()
      if (e.key === 'ArrowRight') skip('next')
      if (e.key === 'ArrowLeft') skip('prev')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controls, fullscreen, play, reveal, skip])

  // --- one gesture handler for the whole deck -----------------------------

  function handlePointerDown(e) {
    // The scrubber owns its own horizontal drag.
    if (e.target.closest('.scrubber')) {
      seeking.current = true
      reveal()
      return
    }
    seeking.current = false
    swiped.current = false
    swipe.current = { x: e.clientX, y: e.clientY, t: performance.now(), axis: null }
  }

  function handlePointerMove(e) {
    const s = swipe.current
    if (!s) return
    // A mouse that was released outside the deck leaves no pointerup behind;
    // without this, the next hover would drag the composition.
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      swipe.current = null
      setSwipeX(0)
      return
    }
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.axis && Math.hypot(dx, dy) > 10) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (s.axis !== 'x') return
    swiped.current = true
    // Damped so the composition leans into the gesture rather than sliding off.
    setSwipeX(dx * 0.42)
  }

  function handlePointerUp(e) {
    if (seeking.current) {
      seeking.current = false
      reveal()
      return
    }
    const s = swipe.current
    swipe.current = null
    setSwipeX(0)
    if (!s) return

    const dx = e.clientX - s.x
    const speed = Math.abs(dx) / Math.max(1, performance.now() - s.t)

    if (s.axis === 'x' && (Math.abs(dx) > SWIPE_COMMIT_PX || speed > SWIPE_FLICK)) {
      skip(dx < 0 ? 'next' : 'prev')
      return
    }

    // A tap anywhere but the record toggles the controls — tap once to bring them
    // up, again to send them away. The record has its own job (play/pause), and a
    // tap that landed on a control must never take that control away.
    if (swiped.current) return
    if (e.target.closest('.deck-chrome, .deck-controls')) reveal()
    else if (!e.target.closest('.disc')) toggleChrome()
  }

  function handlePointerCancel() {
    swipe.current = null
    seeking.current = false
    setSwipeX(0)
  }

  const handleDiscClick = () => {
    // A tap that concluded a swipe shouldn't also stop the music.
    if (swiped.current) {
      swiped.current = false
      return
    }
    // Synchronously, before anything else: iOS only grants audio permission from
    // inside the tap itself — for Spotify's audio element and for the needle.
    play()
  }

  // Tonearm geometry. The pivot sits at the record's top-right corner and the
  // arm hangs down from it, so POSITIVE rotation swings the head inward across
  // the disc. With an arm ~62% of the disc's width, 8deg puts the head on the
  // outer groove and 30deg lands it just outside the label. The resting angle
  // parks it clear of the record entirely.
  const ARM_OUTER_DEG = 8
  const ARM_INNER_DEG = 30
  const ARM_REST_DEG = -6
  const armAngle =
    !track || paused ? ARM_REST_DEG : ARM_OUTER_DEG + ratio * (ARM_INNER_DEG - ARM_OUTER_DEG)

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
    fullscreen.pseudo ? 'is-pseudo-fullscreen' : '',
    chromeUp ? 'chrome-up' : '',
    fly ? `is-flying-${fly}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={deckClass}
      ref={deckRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
    >
      <div className="deck-controls">
        {!fullscreen.active && (
          <button className="ghost-button" onClick={onBack}>
            Back to shelf
          </button>
        )}
        <button
          className="icon-button deck-focus-toggle"
          onClick={fullscreen.toggle}
          aria-pressed={fullscreen.active}
          aria-label={fullscreen.active ? 'Exit full screen' : 'Full screen'}
          title={fullscreen.active ? 'Exit full screen (F)' : 'Full screen (F)'}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
            {fullscreen.active ? (
              <path
                d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
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
      </div>

      <div
        className="deck-stage"
        style={
          swipeX
            ? // No transition while the finger is down: the composition must
              // track it exactly, not chase it.
              { transform: `translate3d(${swipeX}px, 0, 0)`, transition: 'none' }
            : undefined
        }
      >
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
          {cover ? <img src={cover} alt="" draggable="false" /> : <div className="sleeve-blank" />}
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

      {/* Meta, transport and scrubber move as one block, so focus mode can
          float the whole stack over the record without re-laying anything out. */}
      <div className="deck-chrome">
        <div className="deck-meta">
          {contextName && <p className="deck-context">{contextName}</p>}
          <h1 className="deck-title">
            <ScrollingText text={track.name} />
          </h1>
          <p className="deck-artist">
            <ScrollingText text={track.artists?.map((a) => a.name).join(', ') || ''} />
          </p>
        </div>

        <div className="transport">
          <button onClick={() => skip('prev')} aria-label="Previous track" title="Previous track">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M18 5v14L8 12l10-7zM6 5h2v14H6z" fill="currentColor" />
            </svg>
          </button>

          <button
            className="transport-play"
            onClick={play}
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

          <button onClick={() => skip('next')} aria-label="Next track" title="Next track">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M6 5l10 7L6 19V5zM16 5h2v14h-2z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="scrubber">
          <span className="scrubber-time">{clock(position)}</span>
          <input
            type="range"
            min="0"
            max={duration}
            value={position}
            style={{ '--played': `${(ratio * 100).toFixed(2)}%` }}
            onChange={(e) => {
              controls.seek(Number(e.target.value))
              reveal()
            }}
            aria-label="Playback position"
          />
          <span className="scrubber-time">{clock(duration)}</span>
        </div>
      </div>
    </div>
  )
}
