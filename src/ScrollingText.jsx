import { useEffect, useRef, useState } from 'react'

const WINDOW_CHARS = 20

/**
 * Shows text through a fixed ~20-character window. If the string fits, it just
 * sits still. If it doesn't, it scrolls continuously.
 *
 * The trick for a seamless loop: render the string twice, each copy carrying
 * its own trailing padding, then translate the pair by exactly -50%. That lands
 * copy two precisely where copy one started, so there's no visible jump. Using
 * a flex `gap` instead would break the maths, since gap isn't part of the 50%.
 */
export default function ScrollingText({ text = '', className = '' }) {
  const [scrolls, setScrolls] = useState(false)
  const measure = useRef(null)

  useEffect(() => {
    setScrolls(text.length > WINDOW_CHARS)
  }, [text])

  if (!scrolls) {
    return (
      <span className={`marquee is-static ${className}`} ref={measure}>
        {text}
      </span>
    )
  }

  // Long titles shouldn't crawl; scale duration to length with a sane floor.
  const duration = Math.max(7, text.length * 0.38)

  return (
    <span className={`marquee ${className}`} title={text}>
      <span className="marquee-track" style={{ animationDuration: `${duration}s` }}>
        <span className="marquee-copy">{text}</span>
        <span className="marquee-copy" aria-hidden="true">
          {text}
        </span>
      </span>
    </span>
  )
}
