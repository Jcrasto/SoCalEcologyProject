import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { useEffect, useState } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const SOCAL_CENTER = [34.0, -117.5]
const SOCAL_ZOOM = 8

// One distinct color per species (by index into the full 8-species array)
const SPECIES_COLORS = [
  '#2563eb', // Coast Live Oak   — blue
  '#dc2626', // Engelmann Oak    — red
  '#7c3aed', // Valley Oak       — purple
  '#16a34a', // Canyon Live Oak  — green
  '#0891b2', // Interior Live Oak — teal
  '#ca8a04', // Scrub Oak        — amber
  '#be185d', // Island Oak       — pink
  '#78716c', // Blue Oak         — stone
]

function getColor(index) {
  return SPECIES_COLORS[index % SPECIES_COLORS.length]
}

// Tells Leaflet to remeasure its container after it becomes visible.
function MapResizer({ visible }) {
  const map = useMap()
  useEffect(() => {
    if (visible) requestAnimationFrame(() => map.invalidateSize())
  }, [visible, map])
  return null
}

function SpeciesRow({ sp, index, isActive, isSelected, onToggle, onSelect, count, loading }) {
  const color = getColor(index)
  return (
    <div className={`rounded-lg border transition-all ${isSelected ? 'border-oak-400 bg-oak-50' : 'border-transparent hover:bg-gray-50'}`}>
      <div className="flex items-center gap-2 px-2 py-2">
        <input
          type="checkbox"
          checked={isActive}
          onChange={onToggle}
          className="rounded cursor-pointer flex-shrink-0"
          style={{ accentColor: color }}
        />
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
        <button onClick={onSelect} className="flex-1 text-left min-w-0">
          <div className="text-sm font-medium leading-tight truncate text-gray-900">{sp.commonName}</div>
          <div className="text-xs italic truncate text-gray-400">{sp.scientificName}</div>
        </button>
        <span className="text-xs text-gray-400 flex-shrink-0 w-6 text-right">
          {loading ? '…' : count > 0 ? count : ''}
        </span>
      </div>
    </div>
  )
}

export default function MapView({ species, visible = true }) {
  const [activeIds, setActiveIds] = useState(() => new Set(species.map(s => s.id)))
  const [selectedSpecies, setSelectedSpecies] = useState(null)
  const [occurrences, setOccurrences] = useState({})  // species_id → GeoJSON features[]
  const [loadingIds, setLoadingIds] = useState(new Set())

  // Fetch occurrence data from backend for any newly-activated species
  useEffect(() => {
    species.forEach(sp => {
      if (!activeIds.has(sp.id)) return
      if (occurrences[sp.id] !== undefined || loadingIds.has(sp.id)) return

      setLoadingIds(prev => new Set([...prev, sp.id]))
      fetch(`/api/distribution/${sp.id}`)
        .then(r => r.ok ? r.json() : { features: [] })
        .then(data => setOccurrences(prev => ({ ...prev, [sp.id]: data.features || [] })))
        .catch(() => setOccurrences(prev => ({ ...prev, [sp.id]: [] })))
        .finally(() => setLoadingIds(prev => { const n = new Set(prev); n.delete(sp.id); return n }))
    })
  }, [activeIds, species])

  function toggleSpecies(id) {
    setActiveIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectSpecies(sp) {
    setSelectedSpecies(prev => prev?.id === sp.id ? null : sp)
  }

  function toggleAll() {
    const allOn = species.every(s => activeIds.has(s.id))
    setActiveIds(allOn ? new Set() : new Set(species.map(s => s.id)))
  }

  const totalPoints = Object.values(occurrences).reduce((n, f) => n + f.length, 0)

  return (
    <div className="flex" style={{ height: '100%', width: '100%' }}>

      {/* ── Left panel ─────────────────────────────── */}
      <div className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Species Layers</h3>
            <p className="text-xs text-gray-400">
              {totalPoints > 0 ? `${totalPoints} observations` : 'iNat · GBIF observations'}
            </p>
          </div>
          <button onClick={toggleAll} className="text-xs text-oak-600 hover:text-oak-800 font-medium">
            {species.every(s => activeIds.has(s.id)) ? 'Hide all' : 'Show all'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-1 px-1">
          {species.map((sp, i) => (
            <SpeciesRow
              key={sp.id}
              sp={sp}
              index={i}
              isActive={activeIds.has(sp.id)}
              isSelected={selectedSpecies?.id === sp.id}
              onToggle={() => toggleSpecies(sp.id)}
              onSelect={() => selectSpecies(sp)}
              count={(occurrences[sp.id] || []).length}
              loading={loadingIds.has(sp.id)}
            />
          ))}
        </div>

        {/* Selected species info card */}
        {selectedSpecies && (
          <div className="border-t border-gray-200 p-3 bg-gray-50 text-sm">
            <div className="flex items-start justify-between mb-1.5">
              <div>
                <div className="font-semibold text-gray-900 leading-tight">{selectedSpecies.commonName}</div>
                <div className="text-xs italic text-gray-500">{selectedSpecies.scientificName}</div>
              </div>
              <button onClick={() => setSelectedSpecies(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none ml-2">×</button>
            </div>
            <div className="space-y-1 text-xs text-gray-600">
              <div><span className="font-medium text-gray-700">Habitat:</span> {selectedSpecies.habitat}</div>
              <div><span className="font-medium text-gray-700">Elevation:</span> {selectedSpecies.elevationRange}</div>
              <div><span className="font-medium text-gray-700">Status:</span> {selectedSpecies.conservationStatus}</div>
            </div>
            {selectedSpecies.cnpsRank && (
              <div className="mt-2 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                ⚠ {selectedSpecies.cnpsRank.split('—')[0].trim()}
              </div>
            )}
            {occurrences[selectedSpecies.id] !== undefined && (
              <div className="mt-2 text-xs text-gray-500">
                {(occurrences[selectedSpecies.id] || []).length} observations in database
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Map ────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ height: '100%' }}>
        <MapContainer center={SOCAL_CENTER} zoom={SOCAL_ZOOM} style={{ height: '100%', width: '100%' }}>
          <MapResizer visible={visible} />

          {/* CartoDB Positron — clean base for ecological data */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains="abcd"
            maxZoom={19}
          />

          {/* Occurrence markers fetched from backend API */}
          {species.map((sp, i) => {
            if (!activeIds.has(sp.id)) return null
            const features = occurrences[sp.id] || []
            const color = getColor(i)
            return features.map((f, j) => {
              const [lon, lat] = f.geometry?.coordinates || []
              if (!lat || !lon) return null
              return (
                <CircleMarker
                  key={`${sp.id}-${j}`}
                  center={[lat, lon]}
                  radius={5}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.75, weight: 1 }}
                >
                  <Popup>
                    <div className="text-xs space-y-0.5">
                      <div className="font-semibold">{sp.commonName}</div>
                      {f.properties?.observer && <div>Observer: {f.properties.observer}</div>}
                      {f.properties?.obs_date && <div>Date: {f.properties.obs_date}</div>}
                      {f.properties?.source && <div className="text-gray-500 capitalize">Source: {f.properties.source}</div>}
                    </div>
                  </Popup>
                </CircleMarker>
              )
            })
          })}
        </MapContainer>

        {/* Legend — only shows species with loaded observations */}
        {totalPoints > 0 && (
          <div className="absolute bottom-6 right-3 bg-white/90 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 p-2.5 text-xs z-[1000]">
            {species.map((sp, i) => {
              const count = (occurrences[sp.id] || []).length
              if (!activeIds.has(sp.id) || count === 0) return null
              return (
                <div key={sp.id} className="flex items-center gap-1.5 py-0.5">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(i) }} />
                  <span className="text-gray-700">{sp.commonName}</span>
                  <span className="text-gray-400">({count})</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
