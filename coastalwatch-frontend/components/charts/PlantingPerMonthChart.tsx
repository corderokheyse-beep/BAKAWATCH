'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface Props {
  data: { month: string; count: number | string }[]
}

export default function PlantingPerMonthChart({ data }: Props) {
  return (
    <Bar
      data={{
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Records Planted',
          data: data.map(d => Number(d.count)),
          backgroundColor: 'rgba(34,197,94,0.7)',
          borderRadius: 6,
        }],
      }}
      options={{
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 10 }, precision: 0 } },
        },
      }}
    />
  )
}
