'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Props {
  data: { month: string; rate: number | string }[]
}

export default function SurvivalTrendChart({ data }: Props) {
  return (
    <Line
      data={{
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Survival %',
          data: data.map(d => Number(d.rate)),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.08)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
        }],
      }}
      options={{
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { min: 0, max: 100, grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 } } },
        },
      }}
    />
  )
}
