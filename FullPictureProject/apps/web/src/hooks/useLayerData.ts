import { useEffect } from 'react'
import { useLayerStore } from '../stores/layerStore'

const API = '/api/v1'

async function fetchJSON(url: string) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`${resp.status} ${url}`)
  return resp.json()
}

export function useLayerData() {
  const setLayer = useLayerStore((s) => s.setLayer)
  const setEarthquakes = useLayerStore((s) => s.setEarthquakes)

  useEffect(() => {
    const fetchers: Array<{ fn: () => Promise<void>; intervalMs: number }> = [
      {
        fn: async () => setEarthquakes((await fetchJSON(`${API}/layers/earthquakes?hours=72&minmag=1.0`)).features ?? []),
        intervalMs: 5 * 60_000,
      },
      {
        fn: async () => setLayer('vessels', await fetchJSON(`${API}/layers/vessels`)),
        intervalMs: 60_000,
      },
      {
        fn: async () => setLayer('fires', await fetchJSON(`${API}/layers/fires`)),
        intervalMs: 60_000,
      },
      {
        fn: async () => setLayer('weather', await fetchJSON(`${API}/layers/weather/alerts`)),
        intervalMs: 30_000,
      },
      {
        fn: async () => setLayer('tides', await fetchJSON(`${API}/layers/tides`)),
        intervalMs: 5 * 60_000,
      },
      {
        fn: async () => setLayer('satellites', await fetchJSON(`${API}/layers/satellites`)),
        intervalMs: 30_000,
      },
      {
        fn: async () => setLayer('traffic', await fetchJSON(`${API}/layers/traffic`)),
        intervalMs: 30_000,
      },
    ]

    const timers: ReturnType<typeof setInterval>[] = []

    for (const { fn, intervalMs } of fetchers) {
      fn().catch(() => {}) // initial fetch
      timers.push(setInterval(() => fn().catch(() => {}), intervalMs))
    }

    return () => timers.forEach(clearInterval)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
