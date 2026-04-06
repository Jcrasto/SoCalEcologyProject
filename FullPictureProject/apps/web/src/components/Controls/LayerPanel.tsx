import { useLayerStore } from '../../stores/layerStore'
import type { LayerName } from '../../types/layers'

interface LayerConfig {
  name: LayerName
  label: string
  icon: string
  color: string
}

const LAYERS: LayerConfig[] = [
  { name: 'flights',    label: 'Flights',        icon: '✈',  color: '#60a5fa' },
  { name: 'earthquakes',label: 'Earthquakes',    icon: '⚡', color: '#f59e0b' },
  { name: 'vessels',    label: 'Vessels',        icon: '⛵', color: '#34d399' },
  { name: 'fires',      label: 'Fires',          icon: '🔥', color: '#ef4444' },
  { name: 'weather',    label: 'Weather Alerts', icon: '🌩', color: '#a78bfa' },
  { name: 'tides',      label: 'Tides',          icon: '🌊', color: '#38bdf8' },
  { name: 'satellites', label: 'Satellites',     icon: '🛰', color: '#60a5fa' },
  { name: 'traffic',    label: 'Traffic',        icon: '🚗', color: '#22c55e' },
]

interface LayerPanelProps {
  wsConnected: boolean
}

export function LayerPanel({ wsConnected }: LayerPanelProps) {
  const { enabled, toggleLayer, flights, earthquakes, vessels, fires, satellites, traffic } = useLayerStore()

  function countFor(name: LayerName): number | null {
    switch (name) {
      case 'flights':     return flights.length
      case 'earthquakes': return earthquakes.length
      case 'vessels':     return vessels?.features.length ?? null
      case 'fires':       return fires?.features.length ?? null
      case 'satellites':  return satellites?.features.length ?? null
      case 'traffic':     return traffic?.features.length ?? null
      default:            return null
    }
  }

  return (
    <div style={{
      position: 'absolute',
      top: 16,
      left: 16,
      width: 220,
      background: 'rgba(10, 14, 23, 0.88)',
      backdropFilter: 'blur(10px)',
      borderRadius: 12,
      border: '1px solid rgba(255,255,255,0.08)',
      padding: '16px 14px',
      zIndex: 10,
      userSelect: 'none',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Title */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', letterSpacing: '0.02em' }}>
          Full Picture
        </div>
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
          Southern California Monitor
        </div>
        {/* WS status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: wsConnected ? '#22c55e' : '#ef4444',
            boxShadow: wsConnected ? '0 0 6px #22c55e' : 'none',
          }} />
          <span style={{ fontSize: 10, color: '#64748b' }}>
            {wsConnected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 12 }} />

      {/* Layer toggles */}
      {LAYERS.map(({ name, label, icon, color }) => {
        const isOn = enabled[name]
        const count = countFor(name)
        return (
          <div
            key={name}
            onClick={() => toggleLayer(name)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 8px',
              marginBottom: 4,
              borderRadius: 8,
              cursor: 'pointer',
              background: isOn ? 'rgba(255,255,255,0.04)' : 'transparent',
              transition: 'background 0.15s',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>{icon}</span>
              <span style={{
                fontSize: 12,
                color: isOn ? '#e2e8f0' : '#475569',
                fontWeight: isOn ? 500 : 400,
                transition: 'color 0.15s',
              }}>
                {label}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {count !== null && isOn && (
                <span style={{ fontSize: 10, color: color, fontWeight: 600 }}>
                  {count}
                </span>
              )}
              {/* Toggle pill */}
              <div style={{
                width: 28, height: 16,
                borderRadius: 8,
                background: isOn ? color : 'rgba(255,255,255,0.1)',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}>
                <div style={{
                  position: 'absolute',
                  top: 2,
                  left: isOn ? 14 : 2,
                  width: 12, height: 12,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
