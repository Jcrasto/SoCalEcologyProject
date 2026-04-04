import { useWebSocket } from './hooks/useWebSocket'
import { useLayerData } from './hooks/useLayerData'
import { CesiumGlobe } from './components/Globe/CesiumGlobe'
import { LayerPanel } from './components/Controls/LayerPanel'
import { TideChart } from './components/Charts/TideChart'
import { useLayerStore } from './stores/layerStore'

export default function App() {
  const { connected } = useWebSocket()
  useLayerData()

  const tidesEnabled = useLayerStore((s) => s.enabled.tides)

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      {/* 3D Globe */}
      <CesiumGlobe />

      {/* Layer toggle panel */}
      <LayerPanel wsConnected={connected} />

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
