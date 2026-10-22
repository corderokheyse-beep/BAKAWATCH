'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Props {
  data: { month: string; count: number }[]
}

export default function ReportsOverTimeChart({ data }: Props) {
  const chartData = {
    labels: data.map(d => d.month),
    datasets: [{
      label: 'Reports Submitted',
      data: data.map(d => d.count),
      borderColor: '#16a34a',
      backgroundColor: 'rgba(22,163,74,0.1)',
      fill: true,
      tension: 0.4,
      pointBackgroundColor: '#16a34a',
      pointRadius: 4,
    }],
  }

  return (
    <Line
      data={chartData}
      options={{
        responsive: true,
        // Fill the parent container's height instead of forcing a fixed aspect
        // ratio (callers wrap this in a sized box, e.g. h-48/h-52/h-72).
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { mode: 'index' } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } },
        },
      }}
    />
  )
}
