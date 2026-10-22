'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  labels: string[]
  data: number[]
  label?: string
}

// Teal gradient-style bars, rounded tops — matches the Summary Reports mock.
export default function DashboardBarChart({ labels, data, label = 'Count' }: Props) {
  return (
    <Bar
      data={{
        labels,
        datasets: [{
          label,
          data,
          backgroundColor: 'rgba(13,148,136,0.85)',
          hoverBackgroundColor: 'rgba(13,148,136,1)',
          borderRadius: 6,
          maxBarThickness: 44,
        }],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f4' },
            border: { display: false },
            ticks: { font: { size: 10 }, color: '#9ca3af', precision: 0 },
          },
        },
      }}
    />
  )
}
