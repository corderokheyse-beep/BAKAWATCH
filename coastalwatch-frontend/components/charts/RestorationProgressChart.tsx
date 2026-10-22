'use client'

import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { RestorationProject } from '@/lib/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

interface Props {
  projects: Pick<RestorationProject, 'name' | 'trees_planted' | 'trees_target'>[]
}

export default function RestorationProgressChart({ projects }: Props) {
  const chartData = {
    labels: projects.map(p => p.name.length > 20 ? p.name.slice(0, 20) + '…' : p.name),
    datasets: [
      {
        label: 'Trees Planted',
        data: projects.map(p => p.trees_planted),
        backgroundColor: '#22c55e',
        borderRadius: 6,
      },
      {
        label: 'Trees Target',
        data: projects.map(p => p.trees_target),
        backgroundColor: '#bbf7d0',
        borderRadius: 6,
      },
    ],
  }

  return (
    <Bar
      data={chartData}
      options={{
        responsive: true,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { grid: { display: false } },
          y: { beginAtZero: true },
        },
      }}
    />
  )
}
