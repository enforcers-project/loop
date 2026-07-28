import { useEffect, useRef, useState } from 'react'

/**
 * Cursor-paginated event feed. Mirrors the SocialFeed load-more pattern so the
 * whole result set is reachable via a "Load more" button + infinite scroll,
 * instead of being stuck on the backend's first page (the load-more bug).
 *
 * @param {string} key       Identifies the current query. When it changes the
 *                           feed resets and refetches page 1 (render-time reset,
 *                           same convention as the screens' `fetchedKey` blocks —
 *                           avoids a synchronous setState inside an effect).
 * @param {(cursor: string|null) => Promise<{events: any[], nextCursor: string|null}>} loadPage
 *                           Loads one page. Called with null for the first page
 *                           and with the previous page's cursor for each Load
 *                           more. A page with nextCursor === null ends paging.
 *
 * Returns:
 *   events       accumulated events, or null while page 1 is in flight
 *   loadMore()   fetch + append the next page (no-op when none / already loading)
 *   loadingMore  a Load more is in flight
 *   hasMore      another page exists
 *   sentinelRef  attach to an element near the list end for infinite scroll
 */
export function useEventFeed(key, loadPage) {
  const [events, setEvents] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadedKey, setLoadedKey] = useState(null)

  // Keep the latest loader in a ref so loadMore stays stable across renders
  // (loadPage is typically an inline closure that changes every render). The
  // ref is synced in an effect — writing it during render is disallowed.
  const loadPageRef = useRef(loadPage)
  useEffect(() => {
    loadPageRef.current = loadPage
  })

  // Render-time reset when the query changes: blank the list (spinner shows) and
  // drop the cursor before page 1 resolves.
  if (loadedKey !== key) {
    setLoadedKey(key)
    setEvents(null)
    setCursor(null)
  }

  // Fetch page 1 whenever the key changes.
  useEffect(() => {
    let cancelled = false
    loadPageRef.current(null).then((res) => {
      if (cancelled) return
      setEvents(res.events)
      setCursor(res.nextCursor)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  // Fetch the next page and append it, de-duping by id in case the underlying
  // list shifted since the cursor was captured. Guarded so overlapping scroll
  // events don't double-fetch.
  const loadMore = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const res = await loadPageRef.current(cursor)
      setEvents((prev) => {
        const seen = new Set((prev ?? []).map((e) => e.id))
        return [...(prev ?? []), ...res.events.filter((e) => !seen.has(e.id))]
      })
      setCursor(res.nextCursor)
    } finally {
      setLoadingMore(false)
    }
  }

  // Infinite scroll: fire loadMore when the sentinel scrolls into view. Only
  // active while there's a next page and a sentinel is mounted.
  const sentinelRef = useRef(null)
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !cursor || loadingMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loadingMore])

  return { events, loadMore, loadingMore, hasMore: !!cursor, sentinelRef }
}
