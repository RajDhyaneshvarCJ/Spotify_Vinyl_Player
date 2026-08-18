// Pulls two representative colors out of an album cover so the whole room can
// take on the record's color, the way both reference mockups do.
//
// Spotify's image CDN (i.scdn.co) serves permissive CORS headers, which is what
// makes reading pixels off the canvas possible. If that ever changes the canvas
// becomes tainted and getImageData throws — hence the fallback.

const FALLBACK = ['#4a2531', '#241419']
const cache = new Map()

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

// Perceived brightness (ITU-R BT.601). Green dominates how bright a colour
// looks, which is why the channels are not weighted equally.
function luminance(r, g, b) {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * Keeps the room dark enough for light text.
 *
 * The interface is set in near-white, so a pale sleeve (cream, pastel, white
 * artwork) would otherwise produce pale-on-pale and make everything unreadable.
 * Rather than swapping the text colour per-cover — which would make the whole
 * UI flicker between light and dark as you browse — the extracted colour is
 * pulled down to a ceiling brightness. The hue survives, so a cream record
 * still reads as warm; it just becomes a deep version of that warmth.
 */
function capBrightness(r, g, b, ceiling) {
  const current = luminance(r, g, b)
  if (current <= ceiling) return [r, g, b]
  const scale = ceiling / current
  return [r, g, b].map((v) => Math.round(v * scale))
}

export function extractPalette(url) {
  if (!url) return Promise.resolve(FALLBACK)
  if (cache.has(url)) return Promise.resolve(cache.get(url))

  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        // Downscale hard — we want the average impression, not detail, and a
        // tiny canvas keeps this cheap enough to run on every cover change.
        const size = 24
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)

        // Bucket by coarse hue-ish key, then pick the two biggest buckets that
        // aren't near-black or near-white (those read as background, not identity).
        const buckets = new Map()
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const max = Math.max(r, g, b)
          const min = Math.min(r, g, b)
          if (max < 30 || min > 235) continue
          const key = `${r >> 5}-${g >> 5}-${b >> 5}`
          const hit = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0 }
          hit.r += r
          hit.g += g
          hit.b += b
          hit.n += 1
          buckets.set(key, hit)
        }

        const ranked = [...buckets.values()]
          .sort((a, b) => b.n - a.n)
          .slice(0, 2)
          .map((c, i) => {
            const avg = [
              Math.round(c.r / c.n),
              Math.round(c.g / c.n),
              Math.round(c.b / c.n),
            ]
            // The second colour sits further down the gradient, so it is
            // capped harder to keep the vignette falling away into darkness.
            const [r, g, b] = capBrightness(...avg, i === 0 ? 0.3 : 0.16)
            return rgbToHex(r, g, b)
          })

        const result = ranked.length === 2 ? ranked : ranked.length === 1 ? [ranked[0], FALLBACK[1]] : FALLBACK
        cache.set(url, result)
        resolve(result)
      } catch {
        resolve(FALLBACK)
      }
    }

    img.onerror = () => resolve(FALLBACK)
    img.src = url
  })
}
