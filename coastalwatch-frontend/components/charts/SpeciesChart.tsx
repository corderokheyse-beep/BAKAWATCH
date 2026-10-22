'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Title, Tooltip, Legend,
} from 'chart.js'
import { Bar } from 'react-chartjs-2'
import type { SpeciesDistributionItem } from '@/lib/types'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

interface Props {
  data: SpeciesDistributionItem[]
}

export default function SpeciesChart({ data }: Props) {
  const chartData = {
    labels: data.map(d => d.species_name),
    datasets: [{
      label: 'Count',
      data: data.map(d => d.count),
      backgroundColor: '#22c55e',
      borderRadius: 4,
    }],
  }

  return (
    <div className="relative h-full w-full">
      <Bar
        data={chartData}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { top: 4 } },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                afterLabel: (ctx) => {
                  const item = data[ctx.dataIndex]
                  return `${item?.percentage ?? 0}% of total`
                },
              },
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, precision: 0, font: { size: 11 } },
              grid: { color: 'rgba(0,0,0,0.05)' },
              border: { display: false },
            },
            x: {
              grid: { display: false },
              border: { display: false },
              ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 35, autoSkip: false },
            },
          },
        }}
      />
    </div>
  )
}
