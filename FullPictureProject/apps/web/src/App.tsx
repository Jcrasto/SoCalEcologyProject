import { useState } from 'react'
import { useWebSocket } from './hooks/useWebSocket'
import { useLayerData } from './hooks/useLayerData'
import { CesiumGlobe } from './components/Globe/CesiumGlobe'
import { LayerPanel } from './components/Controls/LayerPanel'
import { TideChart } from './components/Charts/TideChart'
import { DataExplorer } from './components/DataExplorer/DataExplorer'
import { useLayerStore } from './stores/layerStore'

export default function App() {
  const { connected } = useWebSocket()
  useLayerData()

  const tidesEnabled = useLayerStore((s) => s.enabled.tides)
  const [view, setView] = useState<'globe' | 'explorer'>('globe')

  if (view === 'explorer') {
    return <DataExplorer onBack={() => setView('globe')} />
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      {/* 3D Globe */}
      <CesiumGlobe />

      {/* Layer toggle panel */}
      <LayerPanel wsConnected={connected} />

      {/* Data Explorer nav button */}
      <button
        onClick={() => setView('explorer')}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 14px',
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(10,14,23,0.88)',
          backdropFilter: 'blur(10px)',
          color: '#94a3b8',
          fontSize: 13,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          cursor: 'pointer',
        }}
      >
        🗄 Data Explorer
      </button>

      {/* Tide chart — slides up from bottom when tides layer is enabled */}
      {tidesEnabled && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
        }}>
          <TideChart />
        </div>
      )}
    </div>
  )
}
