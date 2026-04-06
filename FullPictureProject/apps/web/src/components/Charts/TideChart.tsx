import { useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import { useLayerStore } from '../../stores/layerStore'
import type { TideObservation } from '../../types/layers'

function formatHour(ts: string): string {
  try {
    const d = new Date(ts)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:00`
  } catch {
    return ts
  }
}

function decimateObservations(obs: TideObservation[], maxPoints = 48): TideObservation[] {
  if (obs.length <= maxPoints) return obs
  const step = Math.ceil(obs.length / maxPoints)
  return obs.filter((_, i) => i % step === 0)
}

export function TideChart() {
  const tides = useLayerStore((s) => s.tides)
  const [activeStation, setActiveStation] = useState(0)

  if (!tides || tides.length === 0) {
    return (
      <div style={{ padding: '12px 16px', color: '#64748b', fontSize: 12 }}>
        No tide data available
      </div>
    )
  }

  const station = tides[activeStation] ?? tides[0]
  const data = decimateObservations(station.observations).map((o) => ({
    time: formatHour(o.timestamp),
    observed: o.water_level_m !== null ? +o.water_level_m.toFixed(3) : undefined,
    predicted: o.prediction_m !== null ? +o.prediction_m.toFixed(3) : undefined,
  }))

  return (
    <div style={{
      background: 'rgba(10, 14, 23, 0.92)',
      backdropFilter: 'blur(10px)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '10px 16px 12px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      {/* Station tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
        {tides.map((s, i) => (
          <button
            key={s.station_id}
            onClick={() => setActiveStation(i)}
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: i === activeStation ? 600 : 400,
              background: i === activeStation ? '#38bdf8' : 'rgba(255,255,255,0.07)',
              color: i === activeStation ? '#0f172a' : '#94a3b8',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s',
            }}
          >
            {s.station_name}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
        Water Level (m MLLW) — {station.station_name}
      </div>

      <ResponsiveContainer width="100%" height={130}>
        <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#475569', fontSize: 9 }}
            interval="preserveStartEnd"
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#475569', fontSize: 9 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: 'rgba(15,23,42,0.95)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              fontSize: 11,
              color: '#e2e8f0',
            }}
            labelStyle={{ color: '#94a3b8' }}
          />
          <Legend
            wrapperStyle={{ fontSize: 10, color: '#64748b' }}
          />
          <Line
            type="monotone"
            dataKey="observed"
            stroke="#38bdf8"
            dot={false}
            strokeWidth={1.5}
            connectNulls
            name="Observed"
          />
          <Line
            type="monotone"
            dataKey="predicted"
            stroke="#6366f1"
            dot={false}
            strokeWidth={1.5}
            strokeDasharray="4 3"
            connectNulls
            name="Predicted"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
