'use client'

import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
import { Doughnut } from 'react-chartjs-2'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  data: { category: string; count: number }[]
}

const COLORS = ['#ef4444', '#22c55e', '#3b82f6', '#f97316', '#8b5cf6']

export default function CategoryDonutChart({ data }: Props) {
  const chartData = {
    labels: data.map(d => d.category.charAt(0).toUpperCase() + d.category.slice(1)),
    datasets: [{
      data: data.map(d => d.count),
      backgroundColor: COLORS,
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }

  return (
    <Doughnut
      data={chartData}
      options={{
        responsive: true,
        // Fill the parent container's height instead of forcing a 1:1 aspect
        // ratio (callers wrap this in a sized box). Without this the donut
        // expands to the full page width and overflows.
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 16, font: { size: 12 } } },
        },
      }}
    />
  )
}
