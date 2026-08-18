import ScrollingText from './ScrollingText.jsx'

function clock(ms) {
  if (!ms) return '--:--'
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/**
 * The back of the sleeve: everything on the record you just pulled out.
 *
 * Sits between the crate and the deck so choosing a record and choosing a track
 * are separate decisions. Playing from here always starts the whole album or
 * playlist at the chosen index rather than the single track alone, so the rest
 * of the record queues up behind it the way a side of vinyl would.
 */
export default function TrackList({
  item,
  tracks,
  loading,
  error,
  currentTrackId,
  onPlayIndex,
  onBack,
}) {
  return (
    <div className="tracks">
      <div className="deck-controls">
        <button className="ghost-button" onClick={onBack}>
          Back to shelf
        </button>
      </div>

      <div className="tracks-head">
        {item.image ? (
          <img className="tracks-cover" src={item.image} alt="" />
        ) : (
          <div className="tracks-cover sleeve-blank" />
        )}

        <div className="tracks-title">
          <p className="tracks-kind">{item.kind === 'album' ? 'Album' : 'Playlist'}</p>
          <h1>{item.name}</h1>
          <p className="tracks-owner">{item.artist}</p>
          <div className="tracks-actions">
            <button
              className="solid-button"
              onClick={() => onPlayIndex(0)}
              disabled={loading || !tracks.length}
            >
              Play
            </button>
          </div>
        </div>
      </div>

      {loading && <p className="status-pill">Reading the sleeve…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && !error && !tracks.length && (
        <p className="status-pill">This one has no playable tracks.</p>
      )}

      <ul className="tracks-list">
        {tracks.map((t) => {
          const playing = t.id && t.id === currentTrackId
          return (
            <li key={`${t.id}-${t.index}`}>
              <button
                className={`track-row${playing ? ' is-playing' : ''}`}
                onClick={() => onPlayIndex(t.index)}
                aria-current={playing || undefined}
              >
                <span className="track-num">{playing ? '♪' : t.index + 1}</span>
                <span className="track-text">
                  <span className="track-name">{t.name}</span>
                  <span className="track-artist">{t.artist}</span>
                </span>
                <span className="track-time">{clock(t.duration_ms)}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
