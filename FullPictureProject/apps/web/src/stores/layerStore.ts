import { create } from 'zustand'
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  LayerName,
  TideStation,
  PriceSeries,
} from '../types/layers'

interface LayerStore {
  enabled: Record<LayerName, boolean>
  flights: GeoJSONFeature[]
  earthquakes: GeoJSONFeature[]
  vessels: GeoJSONFeatureCollection | null
  fires: GeoJSONFeatureCollection | null
  weather: GeoJSONFeatureCollection | null
  tides: TideStation[]
  satellites: GeoJSONFeatureCollection | null
  traffic: GeoJSONFeatureCollection | null
  prices: Record<string, PriceSeries>

  toggleLayer: (name: LayerName) => void
  setFlights: (features: GeoJSONFeature[]) => void
  addEarthquake: (feature: GeoJSONFeature) => void
  setEarthquakes: (features: GeoJSONFeature[]) => void
  setLayer: (name: LayerName, data: unknown) => void
}

export const useLayerStore = create<LayerStore>((set) => ({
  enabled: {
    flights: true,
    earthquakes: true,
    vessels: true,
    fires: true,
    weather: true,
    tides: true,
    satellites: false,
    traffic: false,
    prices: false,
  },

  flights: [],
  earthquakes: [],
  vessels: null,
  fires: null,
  weather: null,
  tides: [],
  satellites: null,
  traffic: null,
  prices: {},

  toggleLayer: (name) =>
    set((state) => ({
      enabled: { ...state.enabled, [name]: !state.enabled[name] },
    })),

  setFlights: (features) => set({ flights: features }),

  addEarthquake: (feature) =>
    set((state) => {
      const id = (feature.properties as Record<string, unknown>)?.usgs_id as string
      const filtered = state.earthquakes.filter(
        (e) => (e.properties as Record<string, unknown>)?.usgs_id !== id
      )
      return { earthquakes: [feature, ...filtered].slice(0, 500) }
    }),

  setEarthquakes: (features) => set({ earthquakes: features }),

  setLayer: (name, data) => {
    if (name === 'flights') {
      set({ flights: (data as GeoJSONFeatureCollection).features ?? [] })
    } else if (name === 'earthquakes') {
      set({ earthquakes: (data as GeoJSONFeatureCollection).features ?? [] })
    } else if (name === 'tides') {
      set({ tides: data as TideStation[] })
    } else if (name === 'prices') {
      const series = data as PriceSeries
      set((state) => ({
        prices: { ...state.prices, [series.series_id]: series },
      }))
    } else {
      set({ [name]: data } as Pick<LayerStore, typeof name>)
    }
  },
}))
