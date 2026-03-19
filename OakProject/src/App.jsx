import { useState } from 'react'
import SpeciesCard from './components/SpeciesCard.jsx'
import SpeciesDetail from './components/SpeciesDetail.jsx'
import MapView from './components/Map.jsx'
import species from './data/species.json'

export default function App() {
  const [view, setView] = useState('browse') // 'browse' | 'map' | 'detail'
  const [selectedSpecies, setSelectedSpecies] = useState(null)

  function handleSelectSpecies(sp) {
    setSelectedSpecies(sp)
    setView('detail')
  }

  function handleBack() {
    setSelectedSpecies(null)
    setView('browse')
  }

  return (
    <div className="flex flex-col" style={{ height: '100vh' }}>
      {/* Header */}
      <header className="bg-oak-800 text-white shadow-lg flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">🌳 SoCal Oak Explorer</h1>
            <p className="text-oak-200 text-xs">ReOak California · Southern California Native Oaks</p>
          </div>
          <nav className="flex gap-2">
            <button
              onClick={() => setView('browse')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${view === 'browse' ? 'bg-oak-500 text-white' : 'text-oak-200 hover:text-white'}`}
            >
              Species
            </button>
            <button
              onClick={() => setView('map')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${view === 'map' ? 'bg-oak-500 text-white' : 'text-oak-200 hover:text-white'}`}
            >
              Map
            </button>
          </nav>
        </div>
      </header>

      {/* Map view — always mounted to prevent MapContainer remount crash.
          Hidden with CSS when not active so Leaflet keeps its internal state. */}
      <div
        style={{ display: view === 'map' ? 'flex' : 'none', flex: 1, minHeight: 0 }}
      >
        <MapView species={species} visible={view === 'map'} />
      </div>

      {/* Non-map views */}
      {view !== 'map' && (
        <div className="flex-1 overflow-y-auto">
          <main className="max-w-7xl mx-auto px-4 py-6">
            {view === 'browse' && (
              <div>
                <h2 className="text-2xl font-bold text-oak-900 mb-1">Southern California Oak Species</h2>
                <p className="text-oak-600 mb-6 text-sm">
                  8 native oak species of the region — from coastal woodlands to island endemics.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {species.map(sp => (
                    <SpeciesCard key={sp.id} species={sp} onClick={() => handleSelectSpecies(sp)} />
                  ))}
                </div>
              </div>
            )}

            {view === 'detail' && selectedSpecies && (
              <SpeciesDetail species={selectedSpecies} onBack={handleBack} />
            )}
          </main>

          <footer className="border-t border-oak-200 bg-oak-50 py-6 text-center text-xs text-oak-500">
            <p>Data: GBIF (CC-BY) · iNaturalist (CC-BY/CC-BY-NC) · USDA PLANTS (PD) · © OpenStreetMap contributors (ODbL)</p>
            <p className="mt-1">Built for <a href="https://reoakcalifornia.com" className="underline hover:text-oak-800">ReOak California</a></p>
          </footer>
        </div>
      )}
    </div>
  )
}
