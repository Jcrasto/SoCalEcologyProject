import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

// Approximate bounding boxes for SoCal counties
const SOCAL_COUNTIES = {
  'Los Angeles':    { minLon: -118.95, maxLon: -117.65, minLat: 33.70, maxLat: 34.82 },
  'San Diego':      { minLon: -117.60, maxLon: -116.08, minLat: 32.53, maxLat: 33.51 },
  'Riverside':      { minLon: -117.67, maxLon: -114.43, minLat: 33.43, maxLat: 34.08 },
  'San Bernardino': { minLon: -117.67, maxLon: -114.12, minLat: 33.93, maxLat: 35.81 },
  'Orange':         { minLon: -118.12, maxLon: -117.41, minLat: 33.38, maxLat: 33.95 },
  'Ventura':        { minLon: -119.53, maxLon: -118.63, minLat: 34.14, maxLat: 34.85 },
  'Santa Barbara':  { minLon: -120.51, maxLon: -119.44, minLat: 34.49, maxLat: 34.94 },
}

function countByCounty(observations) {
  const counts = Object.fromEntries(Object.keys(SOCAL_COUNTIES).map(c => [c, 0]))
  for (const feature of observations) {
    const [lon, lat] = feature.geometry?.coordinates || []
    if (lon == null) continue
    for (const [county, bbox] of Object.entries(SOCAL_COUNTIES)) {
      if (
        lon >= bbox.minLon &&
        lon <= bbox.maxLon &&
        lat >= bbox.minLat &&
        lat <= bbox.maxLat
      ) {
        counts[county]++
        break
      }
    }
  }
  return counts
}

export default function DistributionChart({ observations }) {
  const counts = countByCounty(observations)
  const labels = Object.keys(counts)
  const values = Object.values(counts)

  const data = {
    labels,
    datasets: [
      {
        label: 'Observations',
        data: values,
        backgroundColor: 'rgba(90, 138, 58, 0.7)',
        borderColor: 'rgba(90, 138, 58, 1)',
        borderWidth: 1,
        borderRadius: 4,
      },
    ],
  }

  const options = {
    responsive: true,
    plugins: {
      legend: { display: false },
      title: { display: false },
    },
    scales: {
      y: { beginAtZero: true, ticks: { precision: 0 } },
    },
  }

  return <Bar data={data} options={options} />
}
