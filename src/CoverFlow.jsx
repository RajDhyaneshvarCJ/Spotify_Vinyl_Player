import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

// How far the pointer must travel before we treat the gesture as a drag rather
// than a click. Below this, a shaky hand should still select the record.
const DRAG_THRESHOLD_PX = 8
// Horizontal distance that advances the crate by one sleeve. Wider than before:
// on a touchscreen a short flick used to jump four records at once.
const PX_PER_STEP = 96
// Sleeves painted either side of centre.
const WINDOW = 6
// How far a flick is allowed to carry, in sleeves.
const MAX_FLING = 4

const tanh = Math.tanh || ((x) => (Math.exp(2 * x) - 1) / (Math.exp(2 * x) + 1))
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/**
 * Where a sleeve sits, given its *continuous* distance from the centre.
 *
 * Everything here is a smooth function of `offset` — no branch on
 * "is this the active one". That is what makes the swipe feel analogue: as your
 * finger moves, a record rotates open a few degrees at a time instead of
 * snapping between two discrete poses.
 *
 * The crate read comes from four cues layered together:
 *   rotateY  – records stand edge-on and swing open toward you
 *   z        – the one in front of you is pulled out of the row
 *   y/rotateZ– its neighbours sink and lean, the way records slump in a box
 *   blur     – depth of field, so the far end of the crate goes soft
 */
export function sleevePose(offset) {
  const d = Math.abs(offset)
  const t = tanh(offset * 1.15)
  // A bump that is 1 at the centre and gone within a sleeve either side.
  const pop = 1 / (1 + (offset * 1.7) ** 2)

  const x = offset * 108 + 54 * t
  const z = 210 * pop - Math.min(d, WINDOW) * 56
  const y = 18 * (1 - pop)
  const rotY = -70 * t
  const rotZ = -1.8 * t
  const scale = 1 - 0.028 * Math.min(d, 4)

  const blur = Math.min(d, 4) * 0.9 * (1 - pop)
  // Distance dimming is a black overlay, not a brightness filter, and the blur
  // only ever lands on non-3D children. Filters and opacities below 1 turn a
  // `preserve-3d` face into a flattened group, which breaks the box's z-sorting
  // (the back board ends up painting over the cover).
  const dim = Math.min(0.9, Math.min(0.42, d * 0.12) + Math.max(0, d - WINDOW + 1.4) * 0.36)

  return {
    transform:
      `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) ` +
      `rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
    faceFilter: blur > 0.02 ? `blur(${blur.toFixed(2)}px)` : 'none',
    faceDim: dim.toFixed(3),
    zIndex: String(300 - Math.round(d * 10)),
  }
}

/**
 * The shelf.
 *
 * Motion is driven by one requestAnimationFrame loop writing transforms
 * directly to the sleeve nodes, rather than by a CSS transition on a React
 * state change. Two reasons:
 *
 *  1. While a finger is down the crate must track it 1:1. A transition always
 *     lags the input by its own duration, which is exactly the "not smooth on
 *     touch" feeling.
 *  2. On release the row settles with a spring and can carry a flick past the
 *     next record — momentum a fixed-duration transition cannot express.
 *
 * Deliberately NOT using setPointerCapture: capturing on this container
 * retargets the subsequent `click` to the container, so the sleeve buttons never
 * receive it and nothing is selectable. The drag is tracked in a ref instead and
 * a click that followed real movement is suppressed.
 */
export default function CoverFlow({ items, index, onIndex, onSelect }) {
  const shelfRef = useRef(null)
  const nodes = useRef(new Map())

  const pos = useRef(index) // continuous centre, in sleeves
  const target = useRef(index)
  const vel = useRef(0)
  const raf = useRef(0)
  const drag = useRef(null)
  const dragged = useRef(false)
  const wheelLock = useRef(0)

  const last = items.length - 1

  const paint = useCallback(() => {
    const p = pos.current
    nodes.current.forEach((node, i) => {
      if (!node) return
      const pose = sleevePose(i - p)
      node.style.transform = pose.transform
      node.style.setProperty('--face-filter', pose.faceFilter)
      node.style.setProperty('--face-dim', pose.faceDim)
      node.style.zIndex = pose.zIndex
    })
  }, [])

  const tick = useCallback(() => {
    raf.current = 0
    if (!drag.current) {
      const diff = target.current - pos.current
      // Damped spring. Stiffness/damping tuned so a one-step move lands in
      // ~320ms with a whisper of overshoot, and a fling glides.
      vel.current = vel.current * 0.74 + diff * 0.2
      pos.current += vel.current
      if (Math.abs(diff) < 0.0015 && Math.abs(vel.current) < 0.0015) {
        pos.current = target.current
        vel.current = 0
        paint()
        return
      }
    }
    paint()
    raf.current = requestAnimationFrame(tick)
  }, [paint])

  const kick = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(tick)
  }, [tick])

  // Paint on every render so sleeves entering the window are placed before the
  // browser shows them — a fresh node would otherwise flash at offset 0.
  useLayoutEffect(() => {
    paint()
  })

  // An index change from outside the drag (keyboard, wheel, tab switch) becomes
  // the spring's new destination.
  useEffect(() => {
    if (drag.current) return
    target.current = index
    kick()
  }, [index, kick])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') onIndex(Math.min(index + 1, last))
      if (e.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0))
      if (e.key === 'Enter') onSelect(items[index])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items, last, onIndex, onSelect])

  /**
   * Horizontal wheel/trackpad gestures must be consumed here, or macOS and
   * Chrome read them as a back-navigation swipe and leave the app entirely.
   * React's onWheel is registered passively, so preventDefault() is a no-op
   * there — the listener has to be attached natively with passive: false.
   */
  const handleWheel = useCallback(
    (e) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY)
      if (horizontal) e.preventDefault()

      const now = Date.now()
      if (now - wheelLock.current < 110) return
      const delta = horizontal ? e.deltaX : e.deltaY
      if (Math.abs(delta) < 4) return
      wheelLock.current = now
      onIndex(clamp(index + Math.sign(delta), 0, last))
    },
    [index, last, onIndex]
  )

  useEffect(() => {
    const node = shelfRef.current
    if (!node) return
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  function handlePointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // Cleared here rather than on a timer: `click` fires after `pointerup` in a
    // separate task, so clearing on a timeout could race it.
    dragged.current = false
    vel.current = 0
    drag.current = {
      x: e.clientX,
      from: pos.current,
      lastX: e.clientX,
      lastT: performance.now(),
      speed: 0,
    }
    kick()
  }

  function handlePointerMove(e) {
    const d = drag.current
    if (!d) return
    const travelled = d.x - e.clientX
    if (Math.abs(travelled) > DRAG_THRESHOLD_PX) dragged.current = true

    let next = d.from + travelled / PX_PER_STEP
    // Rubber band at the ends: it still moves, just reluctantly, so the crate
    // feels like it has a first and last record rather than a dead stop.
    if (next < 0) next *= 0.32
    else if (next > last) next = last + (next - last) * 0.32
    pos.current = next

    const now = performance.now()
    const dt = now - d.lastT
    if (dt > 8) {
      // sleeves per millisecond, smoothed
      const instant = (d.lastX - e.clientX) / PX_PER_STEP / dt
      d.speed = d.speed * 0.6 + instant * 0.4
      d.lastX = e.clientX
      d.lastT = now
    }

    // Keeps the caption and the painted window in step with the finger.
    const rounded = clamp(Math.round(next), 0, last)
    if (rounded !== index) onIndex(rounded)
  }

  function endDrag() {
    const d = drag.current
    if (!d) return
    drag.current = null

    // Project the flick forward, then snap to the nearest sleeve.
    const carry = clamp(d.speed * 190, -MAX_FLING, MAX_FLING)
    const landed = clamp(Math.round(pos.current + carry), 0, last)
    target.current = landed
    vel.current = 0
    if (landed !== index) onIndex(landed)
    kick()
  }

  function handleSleeveClick(item, i, isActive) {
    // A click that concluded a swipe shouldn't also drop the needle.
    if (dragged.current) return
    if (isActive) onSelect(item)
    else onIndex(i)
  }

  return (
    <div
      className="shelf"
      ref={shelfRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="shelf-stage">
        <div className="crate-floor" aria-hidden="true" />
        {items.map((item, i) => {
          const offset = i - index
          if (Math.abs(offset) > WINDOW + 1) return null
          const isActive = offset === 0

          return (
            <button
              key={item.id}
              type="button"
              ref={(n) => {
                if (n) nodes.current.set(i, n)
                else nodes.current.delete(i)
              }}
              className={`sleeve${isActive ? ' is-active' : ''}`}
              onClick={() => handleSleeveClick(item, i, isActive)}
              aria-label={
                isActive
                  ? `Play ${item.name} by ${item.artist}`
                  : `Show ${item.name} by ${item.artist}`
              }
            >
              {/* The box, painted back to front. The DOM order is the fix, not a
                  nicety: Chromium does not reliably depth-sort parallel faces
                  inside a preserve-3d parent, so an untransformed-looking back
                  board could paint over the cover. Ordering the faces back to
                  front means the printed cover lands last either way, and the
                  explicit translateZ on each face keeps the geometry honest for
                  browsers that do sort. */}
              <span className="sleeve-shadow" aria-hidden="true" />
              <span className="sleeve-back" aria-hidden="true" />
              <span className="sleeve-top" aria-hidden="true" />

              {/* Records to the LEFT of centre turn their left edge toward you;
                  records to the RIGHT turn their right edge. With only one face,
                  half the crate showed a blank spine. `backface-visibility`
                  culls whichever face is turned away, so exactly one is ever
                  readable. */}
              <span className="sleeve-edge sleeve-edge-left">
                <span className="sleeve-edge-text">
                  <strong>{item.name}</strong>
                  <em>{item.artist}</em>
                </span>
              </span>
              <span className="sleeve-edge sleeve-edge-right">
                <span className="sleeve-edge-text">
                  <strong>{item.name}</strong>
                  <em>{item.artist}</em>
                </span>
              </span>

              <span className="sleeve-front">
                {item.image ? (
                  <img src={item.image} alt="" draggable="false" />
                ) : (
                  <span className="sleeve-blank" />
                )}
                <span className="sleeve-gloss" aria-hidden="true" />
              </span>
            </button>
          )
        })}
      </div>

      <p className="shelf-caption">
        <strong>{items[index]?.name}</strong>
        <span>{items[index]?.artist}</span>
      </p>
    </div>
  )
}
