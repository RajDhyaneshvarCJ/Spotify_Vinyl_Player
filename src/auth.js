// ---------------------------------------------------------------------------
// Spotify OAuth via Authorization Code + PKCE.
//
// PKCE exists precisely so that a browser-only app can authenticate WITHOUT a
// client secret. That matters here: a Vite app has no server, so any secret you
// put in .env would still end up inside the bundle. With PKCE there is no
// secret to leak — only the Client ID, which Spotify treats as public.
// ---------------------------------------------------------------------------

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_REDIRECT_URI

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'

// `streaming` is what lets the Web Playback SDK create a device in the browser.
// The rest cover reading your library and controlling playback.
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-library-read',
  'playlist-read-private',
].join(' ')

const STORE_KEY = 'vinyl.tokens'
const VERIFIER_KEY = 'vinyl.verifier'

function randomString(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

function base64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

async function challengeFrom(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(digest)
}

export function configError() {
  if (!CLIENT_ID) return 'VITE_SPOTIFY_CLIENT_ID is not set. Copy .env.example to .env and add your Client ID.'
  if (!REDIRECT_URI) return 'VITE_REDIRECT_URI is not set. Copy .env.example to .env.'
  return null
}

/** Kick off the login redirect. */
export async function login() {
  const verifier = randomString(64)
  // sessionStorage, not localStorage: the verifier is single-use and should not
  // outlive the tab that started the flow.
  sessionStorage.setItem(VERIFIER_KEY, verifier)

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: await challengeFrom(verifier),
    scope: SCOPES,
  })
  window.location.assign(`${AUTH_URL}?${params}`)
}

function persist(payload) {
  const tokens = {
    access_token: payload.access_token,
    // Spotify may omit refresh_token on refresh responses; keep the old one.
    refresh_token: payload.refresh_token ?? readTokens()?.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000,
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(tokens))
  return tokens
}

function readTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY))
  } catch {
    return null
  }
}

export function logout() {
  localStorage.removeItem(STORE_KEY)
  sessionStorage.removeItem(VERIFIER_KEY)
}

/** Handle the ?code=... redirect back from Spotify. */
export async function completeLogin(code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  if (!verifier) throw new Error('Login session expired. Start again.')

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || 'Could not complete login.')

  sessionStorage.removeItem(VERIFIER_KEY)
  return persist(data)
}

async function refresh(refreshToken) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error('Session expired. Sign in again.')
  return persist(data)
}

/**
 * The single accessor everything else uses. Refreshes 60s before expiry so a
 * long track doesn't die mid-playback on a stale token.
 */
export async function getAccessToken() {
  const tokens = readTokens()
  if (!tokens) return null
  if (Date.now() < tokens.expires_at - 60_000) return tokens.access_token
  if (!tokens.refresh_token) return null
  const fresh = await refresh(tokens.refresh_token)
  return fresh.access_token
}

export function hasSession() {
  return Boolean(readTokens())
}
