import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useLayerStore } from '../../stores/layerStore'
import { REGION } from '../../config/region'
import type { GeoJSONFeature, TrafficProperties, EarthquakeProperties, FlightProperties } from '../../types/layers'

Cesium.Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN ?? ''

const CONGESTION_COLORS: Record<string, Cesium.Color> = {
  free: Cesium.Color.fromCssColorString('#22c55e'),
  slow: Cesium.Color.fromCssColorString('#eab308'),
  heavy: Cesium.Color.fromCssColorString('#ef4444'),
  unknown: Cesium.Color.fromCssColorString('#6b7280'),
}

const SEVERITY_COLORS: Record<string, Cesium.Color> = {
  Extreme: Cesium.Color.fromCssColorString('#dc2626').withAlpha(0.5),
  Severe: Cesium.Color.fromCssColorString('#ea580c').withAlpha(0.4),
  Moderate: Cesium.Color.fromCssColorString('#ca8a04').withAlpha(0.3),
  Minor: Cesium.Color.fromCssColorString('#2563eb').withAlpha(0.2),
  Unknown: Cesium.Color.fromCssColorString('#6b7280').withAlpha(0.15),
}

export function CesiumGlobe() {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Cesium.Viewer | null>(null)

  // Layer primitive refs
  const flightBillboards = useRef<Cesium.BillboardCollection | null>(null)
  const earthquakePoints = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const vesselBillboards = useRef<Cesium.BillboardCollection | null>(null)
  const firePoints = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const satellitePoints = useRef<Cesium.PointPrimitiveCollection | null>(null)
  const trafficLines = useRef<Cesium.PolylineCollection | null>(null)
  const weatherSource = useRef<Cesium.GeoJsonDataSource | null>(null)
  const pulseTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const { flights, earthquakes, vessels, fires, weather, satellites, traffic, enabled } = useLayerStore()

  // ── Initialise viewer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return

    const hasToken = !!import.meta.env.VITE_CESIUM_ION_TOKEN

    const viewer = new Cesium.Viewer(containerRef.current, {
      // Cesium 1.107+: use Terrain object instead of deprecated terrainProvider
      ...(hasToken ? { terrain: Cesium.Terrain.fromWorldTerrain() } : {}),
      baseLayerPicker: false,
      navigationHelpButton: false,
      homeButton: false,
      sceneModePicker: false,
      geocoder: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: true,
    })

    // Add Bing Maps imagery async (Cesium 1.107+ requires fromAssetId())
    if (hasToken) {
      Cesium.IonImageryProvider.fromAssetId(3)
        .then((provider) => {
          if (!viewer.isDestroyed()) viewer.imageryLayers.addImageryProvider(provider)
        })
        .catch(() => {})
    }

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        REGION.centerLon,
        REGION.centerLat,
        REGION.initialAltitudeM
      ),
      duration: 0,
    })

    // Dark scene atmosphere
    viewer.scene.skyAtmosphere.show = true
    viewer.scene.fog.enabled = false

    // Create persistent collections
    flightBillboards.current = viewer.scene.primitives.add(new Cesium.BillboardCollection())
    vesselBillboards.current = viewer.scene.primitives.add(new Cesium.BillboardCollection())
    earthquakePoints.current = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection())
    firePoints.current = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection())
    satellitePoints.current = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection())
    trafficLines.current = viewer.scene.primitives.add(new Cesium.PolylineCollection())

    // Pulsing effect for earthquakes
    let pulse = 1
    let growing = true
    pulseTimer.current = setInterval(() => {
      if (!earthquakePoints.current) return
      const col = earthquakePoints.current
      for (let i = 0; i < col.length; i++) {
        const pt = col.get(i)
        const base = (pt as unknown as { _baseSize: number })._baseSize ?? pt.pixelSize
        pt.pixelSize = base * pulse
      }
      pulse = growing ? pulse + 0.05 : pulse - 0.05
      if (pulse >= 1.4) growing = false
      if (pulse <= 1.0) growing = true
    }, 60)

    viewerRef.current = viewer

    return () => {
      if (pulseTimer.current) clearInterval(pulseTimer.current)
      viewer.destroy()
      viewerRef.current = null
    }
  }, [])

  // ── Flights ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const col = flightBillboards.current
    if (!col) return
    col.removeAll()
    col.show = enabled.flights
    if (!enabled.flights) return

    for (const feat of flights) {
      if (!feat.geometry || feat.geometry.type !== 'Point') continue
      const [lon, lat, alt] = feat.geometry.coordinates
      const props = feat.properties as FlightProperties
      col.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt || 0),
        image: _createAircraftCanvas(props.heading),
        width: 24,
        height: 24,
        alignedAxis: Cesium.Cartesian3.ZERO,
        id: props.icao24,
      })
    }
  }, [flights, enabled.flights])

  // ── Earthquakes ────────────────────────────────────────────────────────────
  useEffect(() => {
    const col = earthquakePoints.current
    if (!col) return
    col.removeAll()
    col.show = enabled.earthquakes
    if (!enabled.earthquakes) return

    for (const feat of earthquakes) {
      if (!feat.geometry || feat.geometry.type !== 'Point') continue
      const [lon, lat] = feat.geometry.coordinates
      const props = feat.properties as EarthquakeProperties
      const mag = props.magnitude ?? 1
      const size = Math.max(4, mag * 5)
      const pt = col.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        pixelSize: size,
        color: _magnitudeColor(mag),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.8),
        outlineWidth: 1,
        id: feat,
      });
      (pt as unknown as { _baseSize: number })._baseSize = size
    }
  }, [earthquakes, enabled.earthquakes])

  // ── Vessels ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const col = vesselBillboards.current
    if (!col) return
    col.removeAll()
    col.show = enabled.vessels
    if (!enabled.vessels || !vessels) return

    for (const feat of vessels.features) {
      if (!feat.geometry || feat.geometry.type !== 'Point') continue
      const [lon, lat] = feat.geometry.coordinates
      col.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        image: _createVesselCanvas(),
        width: 16,
        height: 16,
        id: feat,
      })
    }
  }, [vessels, enabled.vessels])

  // ── Fires ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const col = firePoints.current
    if (!col) return
    col.removeAll()
    col.show = enabled.fires
    if (!enabled.fires || !fires) return

    for (const feat of fires.features) {
      if (!feat.geometry || feat.geometry.type !== 'Point') continue
      const [lon, lat] = feat.geometry.coordinates
      const props = feat.properties as Record<string, unknown>
      const frp = (props.frp as number) ?? 0
      col.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        pixelSize: props.layer_type === 'incident' ? 12 : 5 + Math.min(frp / 10, 8),
        color: props.layer_type === 'incident'
          ? Cesium.Color.fromCssColorString('#ff6b00')
          : Cesium.Color.fromHsl(0.05 - Math.min(frp / 2000, 0.05), 1.0, 0.5),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.6),
        outlineWidth: 1,
        id: feat,
      })
    }
  }, [fires, enabled.fires])

  // ── Weather alerts ─────────────────────────────────────────────────────────
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    if (weatherSource.current) {
      viewer.dataSources.remove(weatherSource.current, true)
      weatherSource.current = null
    }
    if (!enabled.weather || !weather) return

    const ds = new Cesium.GeoJsonDataSource('weather')
    ds.load(weather as unknown as Cesium.Resource, {
      fill: Cesium.Color.BLUE.withAlpha(0.2),
      stroke: Cesium.Color.WHITE,
      strokeWidth: 1,
    }).then(() => {
      // Colour by severity
      for (const entity of ds.entities.values) {
        const props = entity.properties
        const severity = props?.severity?.getValue() as string ?? 'Unknown'
        const color = SEVERITY_COLORS[severity] ?? SEVERITY_COLORS.Unknown
        if (entity.polygon) {
          entity.polygon.material = new Cesium.ColorMaterialProperty(color)
          entity.polygon.outline = new Cesium.ConstantProperty(true)
        }
      }
    })
    viewer.dataSources.add(ds)
    weatherSource.current = ds
  }, [weather, enabled.weather])

  // ── Satellites ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const col = satellitePoints.current
    if (!col) return
    col.removeAll()
    col.show = enabled.satellites
    if (!enabled.satellites || !satellites) return

    for (const feat of satellites.features) {
      if (!feat.geometry || feat.geometry.type !== 'Point') continue
      const [lon, lat, alt] = feat.geometry.coordinates
      col.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt || 0),
        pixelSize: 3,
        color: Cesium.Color.fromCssColorString('#60a5fa').withAlpha(0.9),
        id: feat,
      })
    }
  }, [satellites, enabled.satellites])

  // ── Traffic ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const col = trafficLines.current
    if (!col) return
    col.removeAll()
    col.show = enabled.traffic
    if (!enabled.traffic || !traffic) return

    for (const feat of traffic.features) {
      if (!feat.geometry || feat.geometry.type !== 'LineString') continue
      const props = feat.properties as TrafficProperties
      const color = CONGESTION_COLORS[props.congestion_level] ?? CONGESTION_COLORS.unknown
      const positions = (feat.geometry.coordinates as number[][]).map(
        ([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 0)
      )
      col.add({
        positions,
        width: 3,
        material: Cesium.Material.fromType('Color', { color }),
        id: feat,
      })
    }
  }, [traffic, enabled.traffic])

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    />
  )
}

// ── Canvas helpers ─────────────────────────────────────────────────────────

function _createAircraftCanvas(heading = 0): HTMLCanvasElement {
  const size = 32
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.translate(size / 2, size / 2)
  ctx.rotate((heading * Math.PI) / 180)
  ctx.fillStyle = '#60a5fa'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  // Simple aircraft silhouette
  ctx.beginPath()
  ctx.moveTo(0, -10)
  ctx.lineTo(3, 0)
  ctx.lineTo(10, 4)
  ctx.lineTo(3, 3)
  ctx.lineTo(3, 8)
  ctx.lineTo(6, 10)
  ctx.lineTo(0, 9)
  ctx.lineTo(-6, 10)
  ctx.lineTo(-3, 8)
  ctx.lineTo(-3, 3)
  ctx.lineTo(-10, 4)
  ctx.lineTo(-3, 0)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return canvas
}

function _createVesselCanvas(): HTMLCanvasElement {
  const size = 20
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = '#34d399'
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(5, 6)
  ctx.lineTo(0, 4)
  ctx.lineTo(-5, 6)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  return canvas
}

function _magnitudeColor(mag: number): Cesium.Color {
  if (mag >= 6.0) return Cesium.Color.fromCssColorString('#dc2626')
  if (mag >= 5.0) return Cesium.Color.fromCssColorString('#ea580c')
  if (mag >= 4.0) return Cesium.Color.fromCssColorString('#f59e0b')
  if (mag >= 3.0) return Cesium.Color.fromCssColorString('#facc15')
  return Cesium.Color.fromCssColorString('#a3e635')
}
