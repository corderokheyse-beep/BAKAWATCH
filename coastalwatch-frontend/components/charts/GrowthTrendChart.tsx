'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { GrowthTrendPoint } from '@/lib/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Props {
  data: GrowthTrendPoint[]
}

export default function GrowthTrendChart({ data }: Props) {
  const chartData = {
    labels: data.map(d => d.month),
    datasets: [{
      label: 'Avg Height (cm)',
      data: data.map(d => d.avg_height),
      borderColor: '#22c55e',
      backgroundColor: 'rgba(34,197,94,0.15)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#22c55e',
      pointRadius: 4,
    }],
  }

  return (
    <div className="relative h-full w-full">
      <Line
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 4 } },
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false },
          },
          scales: {
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Height (cm)', font: { size: 11 } },
              ticks: { font: { size: 11 } },
              grid: { color: 'rgba(0,0,0,0.05)' },
              border: { display: false },
            },
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { font: { size: 11 } },
            },
          },
        }}
      />
    </div>
  )
}
