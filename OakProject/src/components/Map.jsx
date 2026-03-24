import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'react-leaflet-cluster/lib/assets/MarkerCluster.css'
import { useEffect, useState, useMemo, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import 'leaflet.heat'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const SOCAL_CENTER = [34.0, -117.5]
const SOCAL_ZOOM = 8

const BASEMAPS = {
  streets: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGS, and the GIS User Community',
    maxZoom: 19,
  },
}

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

// Module-level icon cache — avoids recreating L.divIcon on every render
const _iconCache = {}
function getMarkerIcon(color) {
  if (!_iconCache[color]) {
    _iconCache[color] = L.divIcon({
      className: '',
      html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:1.5px solid rgba(255,255,255,0.85);box-shadow:0 1px 3px rgba(0,0,0,0.4)"></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
    })
  }
  return _iconCache[color]
}

function makeClusterIcon(color) {
  return (cluster) => {
    const n = cluster.getChildCount()
    const size = n < 10 ? 28 : n < 100 ? 36 : 44
    return L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;border:2.5px solid white;box-shadow:0 1px 5px rgba(0,0,0,0.35)">${n}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    })
  }
}

// Tells Leaflet to remeasure its container after it becomes visible.
function MapResizer({ visible }) {
  const map = useMap()
  useEffect(() => {
    if (visible) requestAnimationFrame(() => map.invalidateSize())
  }, [visible, map])
  return null
}

// Reports map bounds to parent on move/zoom — used to cull points-mode markers
function BoundsTracker({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => onBoundsChange(map.getBounds()),
    zoomend: () => onBoundsChange(map.getBounds()),
  })
  useEffect(() => { onBoundsChange(map.getBounds()) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// Canvas-based heatmap using leaflet.heat
function HeatLayer({ points }) {
  const map = useMap()
  const layerRef = useRef(null)

  useEffect(() => {
    if (layerRef.current) {
      map.removeLayer(layerRef.current)
      layerRef.current = null
    }
    if (!points.length) return
    layerRef.current = L.heatLayer(
      points.map(p => [p[0], p[1]]),
      {
        radius: 22,
        blur: 28,
        maxZoom: 14,
        minOpacity: 0.35,
        gradient: { 0.2: '#22c55e', 0.5: '#eab308', 0.8: '#f97316', 1.0: '#ef4444' },
      }
    ).addTo(map)
    return () => {
      if (layerRef.current) map.removeLayer(layerRef.current)
    }
  }, [map, points])

  return null
}

// Dual-handle range slider — fully custom to avoid z-index issues with overlapping inputs
function DualSlider({ min, max, value, onChange }) {
  const [lo, hi] = value
  const trackRef = useRef(null)
  const draggingRef = useRef(null) // 'lo' | 'hi' | null
  // Keep latest value/onChange in refs so window listeners never go stale
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  valueRef.current = value
  onChangeRef.current = onChange

  const range = max - min || 1
  const loFrac = (lo - min) / range
  const hiFrac = (hi - min) / range

  useEffect(() => {
    function getVal(clientX) {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return min
      const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      return Math.round(min + frac * (max - min))
    }
    function onMove(e) {
      if (!draggingRef.current) return
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const v = getVal(clientX)
      const [curLo, curHi] = valueRef.current
      if (draggingRef.current === 'lo') onChangeRef.current([Math.min(v, curHi), curHi])
      else onChangeRef.current([curLo, Math.max(v, curLo)])
    }
    function onUp() { draggingRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [min, max])

  function onTrackDown(e) {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const v = Math.round(min + frac * (max - min))
    // Drag whichever thumb is closer; on a tie prefer lo so it can move right
    draggingRef.current = Math.abs(v - lo) <= Math.abs(v - hi) ? 'lo' : 'hi'
    e.preventDefault()
  }

  return (
    <div
      ref={trackRef}
      className="relative h-6 flex items-center mx-1 cursor-pointer select-none"
      onMouseDown={onTrackDown}
      onTouchStart={onTrackDown}
    >
      <div className="absolute inset-x-0 h-1 rounded-full bg-gray-200" />
      <div
        className="absolute h-1 rounded-full bg-oak-500"
        style={{ left: `${loFrac * 100}%`, right: `${(1 - hiFrac) * 100}%` }}
      />
      <div
        className="absolute w-3.5 h-3.5 bg-oak-600 rounded-full border-2 border-white shadow"
        style={{ left: `calc(${loFrac * 100}% - 7px)` }}
      />
      <div
        className="absolute w-3.5 h-3.5 bg-oak-600 rounded-full border-2 border-white shadow"
        style={{ left: `calc(${hiFrac * 100}% - 7px)` }}
      />
    </div>
  )
}

function SpeciesRow({ sp, index, isActive, isSelected, onToggle, onSelect, data, loading }) {
  const color = getColor(index)
  const count = data?.total ?? 0
  const sampled = data?.sampled

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
        <div className="flex-shrink-0 text-right">
          {loading ? (
            <span className="text-xs text-gray-400">…</span>
          ) : count > 0 ? (
            <span className="text-xs text-gray-400">
              {count.toLocaleString()}
              {sampled && <span title="Map shows a representative sample" className="ml-0.5 text-amber-500">*</span>}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function MapView({ species, visible = true }) {
  const [activeIds, setActiveIds] = useState(() => new Set())
  const [selectedSpecies, setSelectedSpecies] = useState(null)
  // occurrences: { species_id → { total, returned, sampled, points: [lat,lon,src,observer,date][] } }
  const [occurrences, setOccurrences] = useState({})
  const [loadingIds, setLoadingIds] = useState(new Set())
  const [basemap, setBasemap] = useState('streets')
  const [showLabels, setShowLabels] = useState(true)
  const [viewMode, setViewMode] = useState('cluster') // 'cluster' | 'heat' | 'points'
  const [yearRange, setYearRange] = useState(null) // null until first data loads
  const [mapBounds, setMapBounds] = useState(null)
  const [fetchErrors, setFetchErrors] = useState(new Set())

  // AbortControllers keyed by species_id — cancelled when species is deactivated or component unmounts
  const abortControllersRef = useRef({})

  // Fetch full point data for any newly-activated species; cancel if deactivated mid-flight
  useEffect(() => {
    // Cancel fetches for species that are no longer active
    Object.keys(abortControllersRef.current).forEach(id => {
      if (!activeIds.has(id)) {
        abortControllersRef.current[id].abort()
        delete abortControllersRef.current[id]
        setLoadingIds(prev => { const n = new Set(prev); n.delete(id); return n })
      }
    })

    species.forEach(sp => {
      if (!activeIds.has(sp.id)) return
      if (occurrences[sp.id] !== undefined || loadingIds.has(sp.id)) return

      const controller = new AbortController()
      abortControllersRef.current[sp.id] = controller

      setLoadingIds(prev => new Set([...prev, sp.id]))
      fetch(`/api/points/${sp.id}?limit=100000`, { signal: controller.signal })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(data => {
          delete abortControllersRef.current[sp.id]
          setFetchErrors(prev => { const n = new Set(prev); n.delete(sp.id); return n })
          setOccurrences(prev => ({ ...prev, [sp.id]: data }))
        })
        .catch(err => {
          if (err.name === 'AbortError') return
          delete abortControllersRef.current[sp.id]
          setFetchErrors(prev => new Set([...prev, sp.id]))
          setOccurrences(prev => ({ ...prev, [sp.id]: { total: 0, returned: 0, sampled: false, points: [] } }))
        })
        .finally(() => setLoadingIds(prev => { const n = new Set(prev); n.delete(sp.id); return n }))
    })

    return () => {
      // Cancel all in-flight fetches on unmount
      Object.values(abortControllersRef.current).forEach(c => c.abort())
      abortControllersRef.current = {}
    }
  }, [activeIds, species]) // eslint-disable-line react-hooks/exhaustive-deps

  // Compute year extent across all loaded data
  const yearExtent = useMemo(() => {
    let min = 9999, max = 0
    Object.values(occurrences).forEach(d => {
      d.points?.forEach(pt => {
        if (!pt[4]) return
        const y = parseInt(pt[4].slice(0, 4), 10)
        if (!isNaN(y) && y > 1900 && y < 2030) {
          if (y < min) min = y
          if (y > max) max = y
        }
      })
    })
    return min <= max ? [min, max] : null
  }, [occurrences])

  // Initialize yearRange to full extent once data first loads
  useEffect(() => {
    if (yearExtent && yearRange === null) {
      setYearRange(yearExtent)
    }
  }, [yearExtent]) // eslint-disable-line react-hooks/exhaustive-deps

  const isFiltered = yearRange && yearExtent &&
    (yearRange[0] > yearExtent[0] || yearRange[1] < yearExtent[1])

  function applyYearFilter(points) {
    if (!isFiltered) return points
    const [lo, hi] = yearRange
    return points.filter(pt => {
      if (!pt[4]) return true
      const y = parseInt(pt[4].slice(0, 4), 10)
      return !isNaN(y) && y >= lo && y <= hi
    })
  }

  // Cluster and points modes both use viewport filtering — caps differ since cluster groups markers
  const MAX_CLUSTER_IN_VIEW = 3000
  const MAX_POINTS_IN_VIEW = 500
  function applyViewportFilter(points) {
    if (!mapBounds || viewMode === 'heat') return points
    const cap = viewMode === 'cluster' ? MAX_CLUSTER_IN_VIEW : MAX_POINTS_IN_VIEW
    const visible = points.filter(pt => mapBounds.contains([pt[0], pt[1]]))
    return visible.slice(0, cap)
  }

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

  const totalPoints = Object.values(occurrences).reduce((n, d) => n + (d.total || 0), 0)
  const anySampled = Object.values(occurrences).some(d => d.sampled)

  // Combined filtered points for heatmap (all active species)
  const heatPoints = useMemo(() => {
    const pts = []
    const lo = yearRange?.[0], hi = yearRange?.[1]
    species.forEach(sp => {
      if (!activeIds.has(sp.id)) return
      const data = occurrences[sp.id]
      if (!data?.points?.length) return
      const filtered = isFiltered
        ? data.points.filter(pt => {
            if (!pt[4]) return true
            const y = parseInt(pt[4].slice(0, 4), 10)
            return !isNaN(y) && y >= lo && y <= hi
          })
        : data.points
      filtered.forEach(pt => pts.push(pt))
    })
    return pts
  }, [species, activeIds, occurrences, yearRange, isFiltered])

  return (
    <div className="flex" style={{ height: '100%', width: '100%' }}>

      {/* ── Left panel ─────────────────────────────── */}
      <div className="w-60 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-3 py-2.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-800 text-sm">Species Layers</h3>
            <p className="text-xs text-gray-400">
              {totalPoints > 0 ? `${totalPoints.toLocaleString()} observations` : 'iNat · GBIF observations'}
            </p>
            {anySampled && (
              <p className="text-xs text-amber-500 mt-0.5">* map shows sampled subset</p>
            )}
          </div>
          <button onClick={toggleAll} className="text-xs text-oak-600 hover:text-oak-800 font-medium">
            {activeIds.size === species.length ? 'Hide all' : 'Show all'}
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
              data={occurrences[sp.id]}
              loading={loadingIds.has(sp.id)}
            />
          ))}
        </div>

        {/* Date range filter — appears once data is loaded */}
        {yearExtent && (
          <div className="border-t border-gray-100 px-3 py-2.5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-gray-700">Date Range</h4>
              <span className={`text-xs font-mono tabular-nums ${isFiltered ? 'text-oak-600 font-semibold' : 'text-gray-400'}`}>
                {yearRange ? `${yearRange[0]} – ${yearRange[1]}` : `${yearExtent[0]} – ${yearExtent[1]}`}
              </span>
            </div>
            <DualSlider
              min={yearExtent[0]}
              max={yearExtent[1]}
              value={yearRange ?? yearExtent}
              onChange={setYearRange}
            />
            {isFiltered && (
              <button
                onClick={() => setYearRange(yearExtent)}
                className="mt-2 text-xs text-oak-600 hover:text-oak-800"
              >
                Reset to all years
              </button>
            )}
          </div>
        )}

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
            {occurrences[selectedSpecies.id] && (
              <div className="mt-2 text-xs text-gray-500">
                {occurrences[selectedSpecies.id].total.toLocaleString()} observations in database
                {occurrences[selectedSpecies.id].sampled && (
                  <span className="text-amber-500"> · showing {occurrences[selectedSpecies.id].returned.toLocaleString()} on map</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Map ────────────────────────────────────── */}
      <div className="flex-1 relative" style={{ height: '100%' }}>
        <MapContainer center={SOCAL_CENTER} zoom={SOCAL_ZOOM} style={{ height: '100%', width: '100%' }}>
          <MapResizer visible={visible} />
          <BoundsTracker onBoundsChange={setMapBounds} />

          <TileLayer key={basemap} {...BASEMAPS[basemap]} />
          {basemap === 'satellite' && showLabels && (
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
              attribution=""
              maxZoom={19}
              opacity={0.9}
            />
          )}

          {/* Heatmap mode — single combined layer for all active species */}
          {viewMode === 'heat' && <HeatLayer points={heatPoints} />}

          {/* Cluster / Points mode */}
          {viewMode !== 'heat' && species.map((sp, i) => {
            if (!activeIds.has(sp.id)) return null
            const data = occurrences[sp.id]
            if (!data?.points?.length) return null
            const color = getColor(i)
            const markerIcon = getMarkerIcon(color)
            const pts = applyViewportFilter(applyYearFilter(data.points))
            if (!pts.length) return null

            const markers = pts.map((pt, j) => (
              <Marker key={j} position={[pt[0], pt[1]]} icon={markerIcon}>
                <Popup>
                  <div className="text-xs space-y-0.5">
                    <div className="font-semibold">{sp.commonName}</div>
                    {pt[3] && <div>Observer: {pt[3]}</div>}
                    {pt[4] && <div>Date: {pt[4]}</div>}
                    {pt[2] && <div className="text-gray-500 capitalize">Source: {pt[2]}</div>}
                  </div>
                </Popup>
              </Marker>
            ))

            if (viewMode === 'points') return markers

            return (
              <MarkerClusterGroup
                key={sp.id}
                iconCreateFunction={makeClusterIcon(color)}
                chunkedLoading
                maxClusterRadius={50}
                spiderfyOnMaxZoom
                showCoverageOnHover={false}
              >
                {markers}
              </MarkerClusterGroup>
            )
          })}
        </MapContainer>

        {/* ── Map controls (top-right) ── */}
        <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-2 items-end">
          {/* Basemap toggle */}
          <div className="flex rounded-lg overflow-hidden shadow-md border border-gray-300 text-xs font-medium">
            <button
              onClick={() => setBasemap('streets')}
              className={`px-3 py-1.5 transition-colors ${basemap === 'streets' ? 'bg-oak-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Map
            </button>
            <button
              onClick={() => setBasemap('satellite')}
              className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${basemap === 'satellite' ? 'bg-oak-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Satellite
            </button>
          </div>

          {/* Labels toggle — satellite only */}
          {basemap === 'satellite' && (
            <button
              onClick={() => setShowLabels(v => !v)}
              className={`px-3 py-1.5 rounded-lg shadow-md border text-xs font-medium transition-colors ${
                showLabels
                  ? 'bg-oak-600 text-white border-oak-700'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              Labels
            </button>
          )}

          {/* View mode toggle */}
          <div className="flex rounded-lg overflow-hidden shadow-md border border-gray-300 text-xs font-medium">
            <button
              onClick={() => setViewMode('cluster')}
              className={`px-3 py-1.5 transition-colors ${viewMode === 'cluster' ? 'bg-oak-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Cluster
            </button>
            <button
              onClick={() => setViewMode('heat')}
              className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${viewMode === 'heat' ? 'bg-oak-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Heat
            </button>
            <button
              onClick={() => setViewMode('points')}
              className={`px-3 py-1.5 transition-colors border-l border-gray-300 ${viewMode === 'points' ? 'bg-oak-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              Points
            </button>
          </div>
        </div>

        {/* Backend error banner */}
        {fetchErrors.size > 0 && (
          <div className="absolute top-3 left-3 z-[1000] bg-red-50 border border-red-300 text-red-700 text-xs px-3 py-2 rounded-lg shadow max-w-xs">
            Could not reach backend API. Make sure FastAPI is running on port 8008.
          </div>
        )}

        {/* Points mode hint */}
        {viewMode === 'points' && totalPoints > 0 && (
          <div className="absolute top-3 left-3 z-[1000] bg-white/90 backdrop-blur-sm text-xs text-gray-500 px-2.5 py-1.5 rounded-lg shadow border border-gray-200">
            Showing observations in view · zoom in for more detail
          </div>
        )}

        {/* Legend */}
        {totalPoints > 0 && (
          <div className="absolute bottom-6 right-3 bg-white/90 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 p-2.5 text-xs z-[1000]">
            {viewMode === 'heat' ? (
              <div>
                <div className="text-gray-500 mb-1.5">Observation density</div>
                <div
                  className="h-2 w-28 rounded-full"
                  style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)' }}
                />
                <div className="flex justify-between text-gray-400 mt-0.5">
                  <span>low</span><span>high</span>
                </div>
              </div>
            ) : (
              species.map((sp, i) => {
                const data = occurrences[sp.id]
                if (!activeIds.has(sp.id) || !data?.total) return null
                const yearFiltered = applyYearFilter(data.points ?? [])
                const viewFiltered = applyViewportFilter(yearFiltered)
                const showCount = viewMode === 'points' || isFiltered
                const count = viewMode === 'points' ? viewFiltered.length : yearFiltered.length
                return (
                  <div key={sp.id} className="flex items-center gap-1.5 py-0.5">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: getColor(i) }} />
                    <span className="text-gray-700">{sp.commonName}</span>
                    <span className="text-gray-400">
                      ({showCount
                        ? `${count.toLocaleString()} shown`
                        : `${data.total.toLocaleString()}${data.sampled ? '*' : ''}`})
                    </span>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
