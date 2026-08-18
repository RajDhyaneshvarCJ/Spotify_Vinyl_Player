import { getAccessToken, logout } from './auth.js'

const BASE = 'https://api.spotify.com/v1'

async function request(path, options = {}) {
  const token = await getAccessToken()
  if (!token) throw new Error('Not signed in.')

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // 204 = success with no body (most playback control calls).
  if (res.status === 204) return null

  if (res.status === 401) {
    logout()
    throw new Error('Session expired. Sign in again.')
  }
  if (res.status === 403) {
    // Three quite different causes share this status, so name all of them
    // rather than sending someone to re-check an account setting that is
    // already correct.
    throw new Error(
      `Spotify refused this request (403) at ${path.split('?')[0]}. That means either: the endpoint was withdrawn in the February 2026 API migration, or this playlist belongs to someone else (Development Mode only returns contents of your own playlists), or this account is not Premium and allowlisted in the developer dashboard.`
    )
  }
  if (res.status === 429) {
    throw new Error(`Rate limited. Wait ${res.headers.get('Retry-After') || 'a few'} seconds.`)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Spotify returned ${res.status}.`)
  }

  return res.json()
}

/** Walk paginated endpoints until exhausted (or we hit `cap` items). */
async function paginate(path, cap = 200) {
  const items = []
  let next = path
  while (next && items.length < cap) {
    const page = await request(next)
    items.push(...(page.items || []))
    // `next` comes back as a full URL; strip the base so request() can reuse it.
    next = page.next ? page.next.replace(BASE, '') : null
  }
  return items
}

export async function getMe() {
  return request('/me')
}

export async function getSavedAlbums() {
  const items = await paginate('/me/albums?limit=50')
  // Saved-album items wrap the album in { added_at, album }.
  return items
    .map((it) => it.album)
    .filter(Boolean)
    .map((a) => ({
      id: a.id,
      uri: a.uri,
      name: a.name,
      artist: a.artists?.map((x) => x.name).join(', ') || '',
      image: a.images?.[0]?.url || null,
      kind: 'album',
    }))
}

export async function getPlaylists() {
  const items = await paginate('/me/playlists?limit=50')
  return items.filter(Boolean).map((p) => ({
    id: p.id,
    uri: p.uri,
    name: p.name,
    artist: p.owner?.display_name || '',
    image: p.images?.[0]?.url || null,
    kind: 'playlist',
  }))
}

/**
 * Move playback to our in-browser device. Without this, `play` has no target
 * and Spotify returns 404 "No active device found".
 */
export async function transferPlayback(deviceId, play = false) {
  return request('/me/player', {
    method: 'PUT',
    body: JSON.stringify({ device_ids: [deviceId], play }),
  })
}

/** Start a whole album or playlist, optionally from a given track index. */
export async function playContext(deviceId, contextUri, offsetIndex = 0) {
  return request(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify({
      context_uri: contextUri,
      offset: { position: offsetIndex },
    }),
  })
}

export async function getContextTracks(item) {
  if (item.kind === 'album') {
    const tracks = await paginate(`/albums/${item.id}/tracks?limit=50`)
    return tracks.map((t, i) => ({
      index: i,
      id: t.id,
      name: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') || '',
      duration_ms: t.duration_ms,
    }))
  }

  // February 2026 migration: GET /playlists/{id}/tracks was REMOVED and now
  // returns 403 for every Development Mode app. The replacement is /items,
  // which also renamed each entry's `track` field to `item`.
  //
  // Reading `it.item ?? it.track` covers both shapes rather than assuming, so
  // this keeps working if Spotify moves again.
  //
  // Note Spotify now only returns contents for playlists you own or collaborate
  // on. Someone else's playlist returns metadata but no items, which is a
  // platform restriction, not something the app can work around.
  const entries = await paginate(`/playlists/${item.id}/items?limit=50`)
  return entries
    .map((it) => it.item ?? it.track)
    .filter((t) => t && t.id)
    .map((t, i) => ({
      index: i,
      id: t.id,
      name: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') || '',
      duration_ms: t.duration_ms,
    }))
}
