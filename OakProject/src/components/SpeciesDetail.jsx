import { useState, useEffect } from 'react'
import PhotoGallery from './PhotoGallery.jsx'
import DistributionChart from './DistributionChart.jsx'

const API_BASE = '/api'

export default function SpeciesDetail({ species, onBack }) {
  const [tab, setTab] = useState('overview')
  const [photos, setPhotos] = useState([])
  const [observations, setObservations] = useState([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)

  useEffect(() => {
    setLoadingPhotos(true)
    fetch(`${API_BASE}/photos/${species.id}`)
      .then(r => r.json())
      .then(data => setPhotos(data))
      .catch(() => setPhotos([]))
      .finally(() => setLoadingPhotos(false))
  }, [species.id])

  useEffect(() => {
    fetch(`${API_BASE}/distribution/${species.id}`)
      .then(r => r.json())
      .then(data => setObservations(data.features || []))
      .catch(() => setObservations([]))
  }, [species.id])

  const tabs = ['overview', 'id-guide', 'ecology', 'photos']
  const tabLabels = {
    'overview': 'Overview',
    'id-guide': 'ID Guide',
    'ecology': 'Ecology',
    'photos': 'Photos',
  }

  return (
    <div>
      {/* Back + header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-oak-600 hover:text-oak-900 mb-4 text-sm font-medium"
      >
        ← Back to all species
      </button>

      <div className="bg-white rounded-xl shadow-sm border border-oak-100 overflow-hidden">
        {/* Hero */}
        <div className="h-32 flex items-end p-6" style={{ backgroundColor: species.heroColor + '44' }}>
          <div>
            <h1 className="text-3xl font-bold text-oak-900">{species.commonName}</h1>
            <p className="text-oak-600 italic">{species.scientificName}</p>
          </div>
        </div>

        {/* Metadata strip */}
        <div className="px-6 py-3 bg-oak-50 border-b border-oak-100 flex flex-wrap gap-4 text-sm">
          {species.usdaSymbol && (
            <span>
              <strong className="text-oak-700">USDA:</strong>{' '}
              <code className="text-oak-600">{species.usdaSymbol}</code>
            </span>
          )}
          {species.gbifTaxonKey && (
            <span>
              <strong className="text-oak-700">GBIF Key:</strong>{' '}
              <code className="text-oak-600">{species.gbifTaxonKey}</code>
            </span>
          )}
          {species.elevationRange && (
            <span>
              <strong className="text-oak-700">Elevation:</strong> {species.elevationRange}
            </span>
          )}
          <span>
            <strong className="text-oak-700">Status:</strong> {species.conservationStatus}
          </span>
        </div>

        {/* Tabs */}
        <div className="border-b border-oak-100 px-6">
          <div className="flex gap-0 -mb-px">
            {tabs.map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-oak-600 text-oak-800'
                    : 'border-transparent text-oak-500 hover:text-oak-800'
                }`}
              >
                {tabLabels[t]}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-6">
          {tab === 'overview' && (
            <div className="max-w-2xl">
              <p className="text-oak-800 text-base leading-relaxed mb-4">{species.description}</p>
              <h3 className="font-semibold text-oak-900 mb-1">Range</h3>
              <p className="text-oak-600 text-sm mb-4">{species.range}</p>
              {species.cnpsRank && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 mb-4">
                  <strong>CNPS Status:</strong> {species.cnpsRank}
                </div>
              )}
              {species.historicalContext && (
                <div className="mb-4">
                  <h3 className="font-semibold text-oak-900 mb-1">Historical Context</h3>
                  <p className="text-oak-700 text-sm leading-relaxed">{species.historicalContext}</p>
                </div>
              )}
              {species.conservationConcern && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                  <strong>Conservation Concern:</strong> {species.conservationConcern}
                </div>
              )}
            </div>
          )}

          {tab === 'id-guide' && (
            <div className="grid sm:grid-cols-2 gap-6 max-w-2xl">
              {[
                { label: 'Leaf', value: species.leafDescription, icon: '🍃' },
                { label: 'Acorn', value: species.acornDescription, icon: '🌰' },
                { label: 'Bark', value: species.barkDescription, icon: '🪵' },
              ].map(({ label, value, icon }) => (
                <div key={label} className="bg-oak-50 rounded-lg p-4">
                  <h3 className="font-semibold text-oak-900 mb-1">{icon} {label}</h3>
                  <p className="text-oak-700 text-sm">{value}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'ecology' && (
            <div className="max-w-2xl space-y-4">
              <div>
                <h3 className="font-semibold text-oak-900 mb-1">Habitat</h3>
                <p className="text-oak-700 text-sm">{species.habitat}</p>
              </div>
              <div>
                <h3 className="font-semibold text-oak-900 mb-1">Fire Response</h3>
                <p className="text-oak-700 text-sm">{species.fireResponse}</p>
              </div>
              {species.ecologicalSignificance && (
                <div>
                  <h3 className="font-semibold text-oak-900 mb-1">Ecological Significance</h3>
                  <p className="text-oak-700 text-sm leading-relaxed">{species.ecologicalSignificance}</p>
                </div>
              )}
              {species.indigenousSignificance && (
                <div>
                  <h3 className="font-semibold text-oak-900 mb-1">Indigenous Significance</h3>
                  <p className="text-oak-700 text-sm leading-relaxed">{species.indigenousSignificance}</p>
                </div>
              )}
              <div>
                <h3 className="font-semibold text-oak-900 mb-1">Associated Species</h3>
                <div className="flex flex-wrap gap-2">
                  {species.associatedSpecies.map(s => (
                    <span
                      key={s}
                      className="px-2 py-1 bg-green-50 text-green-800 text-xs rounded-full border border-green-200"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
              {observations.length > 0 && (
                <div>
                  <h3 className="font-semibold text-oak-900 mb-2">County Distribution</h3>
                  <DistributionChart observations={observations} />
                </div>
              )}
            </div>
          )}

          {tab === 'photos' && (
            <PhotoGallery
              photos={photos}
              loading={loadingPhotos}
              speciesName={species.commonName}
              inatTaxonId={species.iNaturalistTaxonId}
            />
          )}
        </div>
      </div>
    </div>
  )
}
