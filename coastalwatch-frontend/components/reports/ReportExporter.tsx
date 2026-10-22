'use client'

import { useState } from 'react'
import { generateReport, exportReport } from '@/lib/mangrove-api'
import type { RestorationSite, ReportType, GeneratedReport } from '@/lib/types'
import { formatDate } from '@/lib/utils'

interface Props {
  sites: RestorationSite[]
}

export default function ReportExporter({ sites }: Props) {
  const [reportType, setReportType] = useState<ReportType>('monthly')
  const [siteId, setSiteId]         = useState<string>('')
  const [dateFrom, setDateFrom]     = useState('')
  const [dateTo, setDateTo]         = useState('')
  const [period, setPeriod]         = useState('')
  const [generating, setGenerating] = useState(false)
  const [exporting, setExporting]   = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [generated, setGenerated]   = useState<GeneratedReport | null>(null)
  const [error, setError]           = useState('')

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    setReportData(null)
    setGenerated(null)
    try {
      const payload: any = { report_type: reportType }
      if (reportType === 'monthly') {
        if (siteId) payload.site_id = Number(siteId)
        if (period) payload.year_month = period
      } else if (reportType === 'lgu') {
        if (dateFrom) payload.date_from = dateFrom
        if (dateTo)   payload.date_to   = dateTo
      } else if (reportType === 'denr') {
        if (siteId) payload.site_id = Number(siteId)
        if (dateFrom) payload.date_from = dateFrom
        if (dateTo)   payload.date_to   = dateTo
      }
      const data = await generateReport(payload)
      setReportData(data.report)
      setGenerated(data.generated)
    } catch (err: any) {
      const msg = err?.response?.data?.message
        ?? Object.values(err?.response?.data?.errors ?? {}).flat().join(' ')
        ?? 'Failed to generate report.'
      setError(String(msg))
    } finally {
      setGenerating(false)
    }
  }

  const handleExport = async () => {
    if (!generated) return
    setExporting(true)
    try {
      await exportReport(generated.id, `report-${generated.report_type}-${generated.id}.csv`)
    } catch {
      setError('Export failed.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Report Type</label>
          <select className="input" value={reportType} onChange={e => setReportType(e.target.value as ReportType)}>
            <option value="monthly">Monthly</option>
            <option value="lgu">LGU</option>
            <option value="denr">DENR</option>
          </select>
        </div>

        {(reportType === 'monthly' || reportType === 'denr') && (
          <div>
            <label className="label">Site (optional)</label>
            <select className="input" value={siteId} onChange={e => setSiteId(e.target.value)}>
              <option value="">All sites</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {reportType === 'monthly' && (
          <div>
            <label className="label">Month (YYYY-MM)</label>
            <input type="month" className="input" value={period} onChange={e => setPeriod(e.target.value)} />
          </div>
        )}

        {(reportType === 'lgu' || reportType === 'denr') && (
          <>
            <div>
              <label className="label">Date From</label>
              <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Date To</label>
              <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </>
        )}
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-3">
        <button onClick={handleGenerate} disabled={generating} className="btn-primary">
          {generating ? 'Generating…' : 'Generate Report'}
        </button>
        {generated && (
          <button onClick={handleExport} disabled={exporting} className="btn-secondary">
            {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        )}
      </div>

      {reportData && (
        <div className="mt-4 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Planted', value: reportData.total_planted ?? 0, color: 'text-green-700 bg-green-50' },
              { label: 'Total Alive',   value: reportData.total_alive   ?? 0, color: 'text-teal-700 bg-teal-50' },
              { label: 'Total Dead',    value: reportData.total_dead    ?? 0, color: 'text-red-700 bg-red-50' },
              { label: 'Survival Rate', value: `${reportData.survival_rate ?? 0}%`, color: 'text-blue-700 bg-blue-50' },
            ].map(({ label, value, color }) => (
              <div key={label} className={`rounded-xl p-3 ${color}`}>
                <p className="text-xs font-semibold opacity-70 mb-0.5">{label}</p>
                <p className="text-xl font-bold">{value}</p>
              </div>
            ))}
          </div>

          {/* Ecosystem averages */}
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ecosystem Averages</p>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500">Salinity:</span> <span className="font-semibold">{reportData.avg_salinity ?? 0} ppt</span></div>
              <div><span className="text-gray-500">pH:</span> <span className="font-semibold">{reportData.avg_ph ?? 0}</span></div>
              <div><span className="text-gray-500">Temp:</span> <span className="font-semibold">{reportData.avg_temp ?? 0}°C</span></div>
            </div>
          </div>

          {/* Species breakdown */}
          {reportData.species_breakdown?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Species Breakdown</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border border-gray-200 rounded-xl overflow-hidden">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-600">Species</th>
                      <th className="px-4 py-2 text-right font-semibold text-gray-600">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.species_breakdown.map((row: any) => (
                      <tr key={row.species_name} className="border-t border-gray-100">
                        <td className="px-4 py-2 italic text-gray-700">{row.species_name}</td>
                        <td className="px-4 py-2 text-right font-semibold">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
