'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

interface Props {
  labels: string[]
  successful: number[]
  alerts: number[]
}

// Teal area chart for daily platform activity, with an optional security-alert
// overlay line — matches the System Activity mock.
export default function SystemActivityChart({ labels, successful, alerts }: Props) {
  const hasAlerts = alerts.some(a => a > 0)

  return (
    <Line
      data={{
        labels,
        datasets: [
          {
            label: 'Successful events',
            data: successful,
            borderColor: '#0d9488',
            backgroundColor: 'rgba(13,148,136,0.12)',
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
          },
          ...(hasAlerts ? [{
            label: 'Security alerts',
            data: alerts,
            borderColor: '#f97316',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            borderWidth: 2,
            borderDash: [4, 4],
          }] : []),
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
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
