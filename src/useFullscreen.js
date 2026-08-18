import { useCallback, useEffect, useState } from 'react'

/**
 * Full screen for one element, with a fallback that works on iPad.
 *
 * The reason this needs two modes: iOS and iPadOS Safari do not offer the
 * Fullscreen API for arbitrary elements (only <video> gets it), and a page
 * launched from the iPad home screen has no fullscreen affordance at all — so
 * `requestFullscreen` is either missing or rejects, and the old code simply
 * hid its own button and gave up.
 *
 * So: try the real API, and if it is absent or refuses, fall back to
 * "pseudo" full screen — the deck pinned over the viewport with everything else
 * out of the way. Visually it is the same result on a home-screen web app,
 * where Safari's chrome is already gone.
 *
 * Also handled: the user can leave native fullscreen with Escape, which fires
 * no click anywhere in our UI, so `fullscreenchange` keeps React state honest.
 */
export function useFullscreen(ref) {
  const [nativeActive, setNativeActive] = useState(false)
  const [pseudo, setPseudo] = useState(false)

  useEffect(() => {
    function sync() {
      const current = document.fullscreenElement || document.webkitFullscreenElement
      setNativeActive(Boolean(current))
    }
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      document.removeEventListener('webkitfullscreenchange', sync)
    }
  }, [])

  // While pseudo-fullscreen is up, nothing behind it should scroll or rubber-band.
  useEffect(() => {
    if (!pseudo) return
    const root = document.documentElement
    root.classList.add('pseudo-fullscreen-lock')
    return () => root.classList.remove('pseudo-fullscreen-lock')
  }, [pseudo])

  const enter = useCallback(async () => {
    const node = ref.current
    if (!node) return
    try {
      if (node.requestFullscreen) {
        await node.requestFullscreen({ navigationUI: 'hide' })
        return
      }
      if (node.webkitRequestFullscreen) {
        node.webkitRequestFullscreen()
        // Safari's prefixed call is sync and silent on failure; if nothing took
        // the next frame, treat it as unsupported.
        requestAnimationFrame(() => {
          const on = document.fullscreenElement || document.webkitFullscreenElement
          if (!on) setPseudo(true)
        })
        return
      }
    } catch {
      // Blocked by policy, or no gesture credit left. Fall through.
    }
    setPseudo(true)
  }, [ref])

  const exit = useCallback(async () => {
    setPseudo(false)
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
      else if (document.webkitFullscreenElement && document.webkitExitFullscreen)
        document.webkitExitFullscreen()
    } catch {
      /* already out */
    }
  }, [])

  const active = nativeActive || pseudo
  const toggle = useCallback(() => (active ? exit() : enter()), [active, enter, exit])

  // Always offered now: there is a working path on every device.
  return { active, pseudo: pseudo && !nativeActive, supported: true, enter, exit, toggle }
}
