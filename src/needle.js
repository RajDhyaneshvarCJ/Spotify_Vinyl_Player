/**
 * The needle drop.
 *
 * Synthesised rather than shipped as an audio file: it is three sounds a few
 * hundred milliseconds long — the thump of the stylus landing, a scrape as it
 * finds the groove, and the surface crackle that fades under the music — and
 * generating them is smaller than any recording of them and never needs a
 * loading state.
 *
 * Must be called from inside a tap. iOS starts every AudioContext suspended and
 * only resumes it during a user gesture; the deck's play handlers are exactly
 * that, so `resume()` is called on each drop rather than once at startup.
 */

let ctx = null

function context() {
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

/** Noise buffer with a sparse-pop character, built once per length. */
function crackle(ac, seconds, popChance, hiss) {
  const len = Math.floor(ac.sampleRate * seconds)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < len; i++) {
    const decay = (1 - i / len) ** 2
    const pop = Math.random() < popChance ? (Math.random() * 2 - 1) * 0.9 : 0
    data[i] = ((Math.random() * 2 - 1) * hiss + pop) * decay
  }
  return buf
}

export function needleDrop(volume = 0.5) {
  const ac = context()
  if (!ac) return

  const t = ac.currentTime
  const out = ac.createGain()
  out.gain.value = volume
  out.connect(ac.destination)

  // The stylus landing: a short pitched thump through the plinth.
  const thump = ac.createOscillator()
  const thumpGain = ac.createGain()
  thump.type = 'sine'
  thump.frequency.setValueAtTime(160, t)
  thump.frequency.exponentialRampToValueAtTime(46, t + 0.13)
  thumpGain.gain.setValueAtTime(0.0001, t)
  thumpGain.gain.exponentialRampToValueAtTime(0.55, t + 0.01)
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.26)
  thump.connect(thumpGain).connect(out)
  thump.start(t)
  thump.stop(t + 0.28)

  // The scrape of the tip settling into the groove.
  const scrape = ac.createBufferSource()
  scrape.buffer = crackle(ac, 0.22, 0.02, 0.35)
  const scrapeFilter = ac.createBiquadFilter()
  scrapeFilter.type = 'bandpass'
  scrapeFilter.frequency.value = 1400
  scrapeFilter.Q = 0.6
  const scrapeGain = ac.createGain()
  scrapeGain.gain.value = 0.5
  scrape.connect(scrapeFilter).connect(scrapeGain).connect(out)
  scrape.start(t + 0.02)

  // Surface noise, fading away under whatever starts playing.
  const surface = ac.createBufferSource()
  surface.buffer = crackle(ac, 1.6, 0.0015, 0.07)
  const surfaceFilter = ac.createBiquadFilter()
  surfaceFilter.type = 'highpass'
  surfaceFilter.frequency.value = 900
  const surfaceGain = ac.createGain()
  surfaceGain.gain.value = 0.85
  surface.connect(surfaceFilter).connect(surfaceGain).connect(out)
  surface.start(t + 0.05)
}

/** The reverse: a short lift as the arm comes off the record. */
export function needleLift(volume = 0.35) {
  const ac = context()
  if (!ac) return
  const t = ac.currentTime
  const out = ac.createGain()
  out.gain.value = volume
  out.connect(ac.destination)

  const lift = ac.createBufferSource()
  lift.buffer = crackle(ac, 0.16, 0.01, 0.3)
  const filter = ac.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(1200, t)
  filter.frequency.exponentialRampToValueAtTime(3200, t + 0.16)
  filter.Q = 0.8
  lift.connect(filter).connect(out)
  lift.start(t)
}
