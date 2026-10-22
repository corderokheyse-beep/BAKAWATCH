'use client'

import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
} from 'chart.js'
import { Doughnut } from 'react-chartjs-2'
import type { SurvivalRateData } from '@/lib/types'

ChartJS.register(ArcElement, Tooltip, Legend)

interface Props {
  data: SurvivalRateData
}

const centerTextPlugin = {
  id: 'centerText',
  afterDraw(chart: any) {
    const { ctx, chartArea: { width, height, left, top } } = chart
    const rate = chart.data.datasets[0]?._survivalRate ?? 0
    ctx.save()
    ctx.font = 'bold 24px Inter, sans-serif'
    ctx.fillStyle = '#111827'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`${rate}%`, left + width / 2, top + height / 2)
    ctx.restore()
  },
}

export default function SurvivalChart({ data }: Props) {
  const chartData = {
    labels: ['Alive', 'Dead'],
    datasets: [{
      data: [data.alive_count, data.dead_count],
      backgroundColor: ['#22c55e', '#ef4444'],
      borderWidth: 2,
      borderColor: '#fff',
      _survivalRate: data.survival_rate,
    }],
  }

  return (
    <div className="relative h-full w-full">
      <Doughnut
        data={chartData}
        plugins={[centerTextPlugin]}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: '68%',
          layout: { padding: 4 },
          plugins: {
            legend: {
              position: 'bottom',
              labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 8, padding: 16, font: { size: 12 } },
            },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.label}: ${ctx.parsed} (${data.total > 0 ? Math.round((ctx.parsed / data.total) * 100) : 0}%)`,
              },
            },
          },
        }}
      />
    </div>
  )
}
