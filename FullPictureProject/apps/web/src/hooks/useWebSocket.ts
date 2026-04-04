import { useEffect, useRef, useState } from 'react'
import { useLayerStore } from '../stores/layerStore'
import type { WSMessage, GeoJSONFeature } from '../types/layers'

const ALL_LAYERS = ['flights', 'earthquakes', 'vessels', 'fires', 'weather', 'tides', 'satellites', 'traffic']

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const store = useLayerStore()

  useEffect(() => {
    function connect() {
      const ws = new WebSocket(`ws://${window.location.host}/ws`)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify({ type: 'subscribe', layers: ALL_LAYERS }))
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data)
          if (msg.type === 'update') {
            if (msg.layer === 'flights') {
              store.setFlights(msg.data as GeoJSONFeature[])
            } else {
              store.setLayer(msg.layer, {
                type: 'FeatureCollection',
                features: Array.isArray(msg.data) ? msg.data : [msg.data],
              })
            }
          } else if (msg.type === 'alert') {
            if (msg.layer === 'earthquakes') {
              store.addEarthquake(msg.data as GeoJSONFeature)
            }
          }
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { connected }
}
