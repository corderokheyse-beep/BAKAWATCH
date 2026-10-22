'use client'

import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { GrowthTrendPoint, GrowthPredictionPoint } from '@/lib/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface Props {
  historical: GrowthTrendPoint[]
  predictions: GrowthPredictionPoint[]
}

export default function PredictiveGrowthChart({ historical, predictions }: Props) {
  // Combine historical + predicted labels
  const histLabels = historical.map(d => d.month)
  const predLabels = predictions.map(d => d.month)
  const allLabels  = [...histLabels, ...predLabels]

  // Historical data: actual values, null for prediction months
  const histData = [
    ...historical.map(d => d.avg_height),
    ...predictions.map(() => null),
  ]

  // Prediction data: null for historical months, then predicted values
  const predData = [
    ...historical.map((_, i) =>
      i === historical.length - 1 ? historical[i].avg_height : null
    ),
    ...predictions.map(d => d.predicted_height),
  ]

  // Upper bound
  const upperData = [
    ...historical.map(() => null),
    ...predictions.map(d => d.upper_bound),
  ]

  // Lower bound
  const lowerData = [
    ...historical.map(() => null),
    ...predictions.map(d => d.lower_bound),
  ]

  const chartData = {
    labels: allLabels,
    datasets: [
      {
        label: 'Actual Height (cm)',
        data: histData,
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.12)',
        fill: false,
        tension: 0.4,
        pointBackgroundColor: '#22c55e',
        pointRadius: 4,
        borderWidth: 2,
      },
      {
        label: 'Predicted Height (cm)',
        data: predData,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139,92,246,0.10)',
        fill: false,
        tension: 0.4,
        pointBackgroundColor: '#8b5cf6',
        pointRadius: 4,
        borderWidth: 2,
        borderDash: [5, 4],
      },
      {
        label: 'Upper 95% CI',
        data: upperData,
        borderColor: 'rgba(139,92,246,0.3)',
        backgroundColor: 'rgba(139,92,246,0.07)',
        fill: '-1',
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [3, 3],
        tension: 0.4,
      },
      {
        label: 'Lower 95% CI',
        data: lowerData,
        borderColor: 'rgba(139,92,246,0.3)',
        backgroundColor: 'rgba(139,92,246,0.07)',
        fill: false,
        pointRadius: 0,
        borderWidth: 1,
        borderDash: [3, 3],
        tension: 0.4,
      },
    ],
  }

  return (
    <div className="relative h-72 w-full">
    <Line
      data={chartData}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            labels: {
              filter: item => item.text !== 'Upper 95% CI' && item.text !== 'Lower 95% CI',
              boxWidth: 12,
              font: { size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: ctx => {
                if (ctx.parsed.y === null) return ''
                return `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)} cm`
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: false,
            title: { display: true, text: 'Avg Height (cm)', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,0.04)' },
          },
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 } },
          },
        },
      }}
    />
    </div>
  )
}
