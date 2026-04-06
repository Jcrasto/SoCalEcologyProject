export type LayerName =
  | 'flights'
  | 'earthquakes'
  | 'vessels'
  | 'fires'
  | 'weather'
  | 'tides'
  | 'satellites'
  | 'traffic'
  | 'prices'

export interface GeoJSONFeature<P = Record<string, unknown>> {
  type: 'Feature'
  geometry: GeoJSONGeometry | null
  properties: P
  id?: string | number
}

export interface GeoJSONFeatureCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection'
  features: GeoJSONFeature<P>[]
}

export type GeoJSONGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export interface FlightProperties {
  icao24: string
  callsign: string
  altitude_m: number
  velocity_ms: number
  heading: number
  on_ground: boolean
  timestamp: string
}

export interface EarthquakeProperties {
  usgs_id: string
  magnitude: number
  depth_km: number
  place: string
  event_time: string
}

export interface VesselProperties {
  mmsi: string
  vessel_name: string
  vessel_type: string
  speed_kts: number
  course_deg: number
  nav_status: string
  timestamp: string
}

export interface FireDetectionProperties {
  layer_type: 'detection'
  brightness: number
  frp: number
  confidence: string
  satellite: string
  acq_time: string
  source: string
}

export interface FireIncidentProperties {
  layer_type: 'incident'
  incident_name: string
  acres: number
  containment_pct: number
  start_date: string
}

export interface WeatherAlertProperties {
  alert_id: string
  event: string
  severity: string
  headline: string
  description: string
  expires: string
}

export interface SatelliteProperties {
  norad_id: number
  name: string
  object_type: string
  altitude_km: number
  velocity_kms: number
}

export interface TrafficProperties {
  segment_id: string
  speed_kmh: number
  free_flow_speed_kmh: number
  congestion_level: 'free' | 'slow' | 'heavy' | 'unknown'
}

export interface TideObservation {
  timestamp: string
  water_level_m: number | null
  prediction_m: number | null
}

export interface TideStation {
  station_id: string
  station_name: string
  lat: number
  lon: number
  observations: TideObservation[]
}

export interface PriceObservation {
  date: string
  value: number | null
}

export interface PriceSeries {
  series_id: string
  series_name: string | null
  unit: string | null
  observations: PriceObservation[]
}

export interface WSMessage {
  type: 'update' | 'alert'
  layer: LayerName
  data: GeoJSONFeature[] | GeoJSONFeature
  ts: number
}
