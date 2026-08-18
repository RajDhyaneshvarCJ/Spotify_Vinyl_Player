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
    // In Development Mode this usually means the listening account isn't on the
    // app's allowlist, or isn't Premium. Worth calling out by name.
    throw new Error(
      'Spotify refused the request (403). Check that this account is Premium and is added to your app\'s user allowlist in the developer dashboard.'
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
    const data = await request(`/albums/${item.id}/tracks?limit=50`)
    return (data.items || []).map((t, i) => ({
      index: i,
      id: t.id,
      name: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') || '',
      duration_ms: t.duration_ms,
    }))
  }
  const data = await request(`/playlists/${item.id}/tracks?limit=50`)
  return (data.items || [])
    .map((it) => it.track)
    .filter((t) => t && t.id)
    .map((t, i) => ({
      index: i,
      id: t.id,
      name: t.name,
      artist: t.artists?.map((a) => a.name).join(', ') || '',
      duration_ms: t.duration_ms,
    }))
}
