import { useCallback, useEffect, useState } from 'react'

/**
 * Wraps the Fullscreen API for a single element.
 *
 * Two things this has to handle that a naive version misses:
 *  1. Safari still ships the webkit-prefixed methods, so both spellings are
 *     tried on the way in and out.
 *  2. The user can leave fullscreen by pressing Escape, which fires no click
 *     anywhere in our UI. Listening to `fullscreenchange` keeps React state in
 *     sync with reality instead of letting the button lie about the mode.
 */
export function useFullscreen(ref) {
  const [active, setActive] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    const el = document.documentElement
    setSupported(
      Boolean(el.requestFullscreen || el.webkitRequestFullscreen)
    )
  }, [])

  useEffect(() => {
    function sync() {
      const current = document.fullscreenElement || document.webkitFullscreenElement
      setActive(Boolean(current))
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  const enter = useCallback(async () => {
    const node = ref.current
    if (!node) return
    try {
      if (node.requestFullscreen) await node.requestFullscreen({ navigationUI: 'hide' })
      else if (node.webkitRequestFullscreen) node.webkitRequestFullscreen()
    } catch {
      // Fullscreen requires a user gesture and can be blocked by policy.
      // Failing quietly is right here — the deck still works windowed.
    }
  }, [ref])

  const exit = useCallback(async () => {
    try {
      if (document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
    } catch {
      /* already out */
    }
  }, [])

  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit])

  return { active, supported, enter, exit, toggle }
}
