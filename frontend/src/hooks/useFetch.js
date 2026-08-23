import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Load data from the API and track the three states every request has:
 * loading, error, and data.
 *
 * Writing this once means no page has to remember to handle all three - and
 * "forgot to handle the error state" is the most common bug in beginner React
 * apps.
 *
 * `fetcher` must be stable (wrap it in useCallback in the calling component),
 * otherwise the effect re-runs on every render and you get an infinite loop.
 */
export function useFetch(fetcher, { immediate = true } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(immediate)

  // Guards against setting state after the component has unmounted, which
  // happens when the user navigates away mid-request.
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher()
      if (alive.current) setData(result)
      return result
    } catch (err) {
      if (alive.current) setError(err)
      return null
    } finally {
      if (alive.current) setLoading(false)
    }
  }, [fetcher])

  useEffect(() => {
    if (immediate) run()
  }, [run, immediate])

  return { data, error, loading, reload: run, setData }
}

/**
 * Delay a fast-changing value.
 *
 * Used by the search boxes: without it, typing "Mohammed" fires eight requests.
 * With a 300 ms debounce it fires one.
 */
export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
