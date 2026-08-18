import { useCallback, useEffect, useRef } from 'react'

// How far the pointer must travel before we treat the gesture as a drag rather
// than a click. Below this, a shaky hand should still select the record.
const DRAG_THRESHOLD_PX = 6
// Horizontal distance that advances the crate by one sleeve.
const PX_PER_STEP = 70

/**
 * The shelf. Covers are fanned in 3D like records standing in a crate: the one
 * at the cursor opens toward you, its neighbours stay edge-on.
 *
 * Each sleeve is a real 3D box, not a flat image - a front face plus a spine
 * face joined at the left edge. That's what makes the titles readable on the
 * fanned records: you're looking at an actual printed spine.
 *
 * Motion is one CSS transition per sleeve, driven by the committed index. A
 * finger-tracking rAF version was tried and felt heavier on an iPad: every frame
 * touched a dozen sleeves, and the stepped transition reads as the smoother of
 * the two.
 *
 * Deliberately NOT using setPointerCapture here. Capturing the pointer on this
 * container retargets the subsequent `click` to the container itself, so the
 * sleeve buttons never receive it and nothing is selectable. Instead the drag
 * is tracked in a ref and a click that followed real movement is suppressed.
 */
export default function CoverFlow({ items, index, onIndex, onSelect }) {
  const drag = useRef(null)
  const dragged = useRef(false)
  const wheelLock = useRef(0)
  const shelfRef = useRef(null)

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') onIndex(Math.min(index + 1, items.length - 1))
      if (e.key === 'ArrowLeft') onIndex(Math.max(index - 1, 0))
      if (e.key === 'Enter') onSelect(items[index])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items, onIndex, onSelect])

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

      // Trackpads fire dozens of events per flick; throttle to one card each.
      const now = Date.now()
      if (now - wheelLock.current < 110) return
      const delta = horizontal ? e.deltaX : e.deltaY
      if (Math.abs(delta) < 4) return
      wheelLock.current = now
      onIndex(Math.min(Math.max(index + Math.sign(delta), 0), items.length - 1))
    },
    [index, items.length, onIndex]
  )

  useEffect(() => {
    const node = shelfRef.current
    if (!node) return
    node.addEventListener('wheel', handleWheel, { passive: false })
    return () => node.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  function handlePointerDown(e) {
    // Cleared here rather than on a timer: `click` fires after `pointerup` in a
    // separate task, so clearing on a timeout could race it.
    dragged.current = false
    drag.current = { x: e.clientX, startIndex: index }
  }

  function handlePointerMove(e) {
    const d = drag.current
    if (!d) return
    const dx = d.x - e.clientX
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) dragged.current = true
    const target = Math.min(
      Math.max(d.startIndex + Math.round(dx / PX_PER_STEP), 0),
      items.length - 1
    )
    if (target !== index) onIndex(target)
  }

  function endDrag() {
    drag.current = null
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
        {items.map((item, i) => {
          const offset = i - index
          const distance = Math.abs(offset)
          // Beyond a few cards away nothing is legible, so stop painting them.
          if (distance > 7) return null

          const isActive = offset === 0
          // Edge-on neighbours, face-on centre - the crate-of-records read.
          const rotate = isActive ? 0 : offset < 0 ? 66 : -66
          const x = offset * 122 + (isActive ? 0 : Math.sign(offset) * 44)
          const z = isActive ? 130 : -distance * 62

          return (
            <button
              key={item.id}
              type="button"
              className={`sleeve${isActive ? ' is-active' : ''}`}
              style={{
                transform: `translateX(${x}px) translateZ(${z}px) rotateY(${rotate}deg)`,
                zIndex: 100 - distance,
              }}
              onClick={() => handleSleeveClick(item, i, isActive)}
              aria-label={
                isActive
                  ? `Play ${item.name} by ${item.artist}`
                  : `Show ${item.name} by ${item.artist}`
              }
            >
              <span className="sleeve-front">
                {item.image ? (
                  <img src={item.image} alt="" draggable="false" />
                ) : (
                  <span className="sleeve-blank" />
                )}
              </span>

              {/* Both side faces of the box get printed. Records to the LEFT of
                  centre turn their left edge toward you; records to the RIGHT
                  turn their right edge. With only one face, half the crate
                  showed a blank spine. `backface-visibility` culls whichever
                  face is turned away, so exactly one is ever readable. */}
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
