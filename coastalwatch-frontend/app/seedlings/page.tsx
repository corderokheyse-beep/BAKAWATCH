'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import SidebarLayout from '@/components/layout/SidebarLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/lib/auth-context'
import {
  fetchSeedlings, fetchSites, fetchSeedlingSummary, fetchSpecies, fetchNurseries,
  createSeedlingEntry, updateSeedlingEntry, deleteSeedlingEntry,
} from '@/lib/mangrove-api'
import type {
  SeedlingInventory, RestorationSite, SeedlingSummaryItem, MangroveSpecies, Nursery,
} from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { zonationLabel, getZonation, ZONE_DESCRIPTIONS } from '@/lib/mangrove-zonation'
import { fetchInventoryPeriodSummary } from '@/lib/mangrove-api'
import type { InventoryPeriodSummary } from '@/lib/types'
import InventoryMovementsPanel, { type LedgerTotals } from '@/components/inventory/InventoryMovementsPanel'
import {
  Plus, Pencil, Trash2, Sprout, Loader2, X,
  CheckCircle2, Download, Minus, ChevronDown, ChevronRight,
  ArrowDownCircle, ArrowUpCircle, AlertTriangle, Eye,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'

// Fixed lifecycle stages (value sent to the API → label shown in the dropdown).
const STAGE_OPTIONS: { value: SeedlingStageValue; label: string }[] = [
  { value: 'propagule', label: 'Propagule' },
  { value: 'seedling',  label: 'Seedling'  },
  { value: 'sapling',   label: 'Sapling'   },
  { value: 'mature',    label: 'Mature'    },
]
type SeedlingStageValue = 'propagule' | 'seedling' | 'sapling' | 'mature'

interface FormState {
  restoration_site_id: string
  species_name: string
  source_nursery: string
  date_received: string
  beginning_stock: string   // current stock on hand before this count
  quantity_received: string // Added stock
  quantity_planted: string  // Released
  quantity_damaged: string  // Mortality
  stage: SeedlingStageValue
  notes: string
}

// The single, fixed seedling source (only one nursery supplies the LGU).
const DEFAULT_SOURCE = 'LGU Nursery'

// Per-field inline validation errors.
type FormErrors = Partial<Record<keyof FormState, string>>

// A per-species quantity line within the multi-species "add" form.
interface SpeciesRow {
  species_name: string
  quantity_received: string
  quantity_planted: string
  quantity_damaged: string
}

const emptySpeciesRow = (species_name: string): SpeciesRow => ({
  species_name,
  quantity_received: '',
  quantity_planted: '0',
  quantity_damaged: '0',
})

const emptyForm = (): FormState => ({
  restoration_site_id: '',
  species_name: '',
  source_nursery: DEFAULT_SOURCE,
  date_received: new Date().toISOString().split('T')[0],
  beginning_stock: '0',
  quantity_received: '0',
  quantity_planted: '0',
  quantity_damaged: '0',
  stage: 'seedling',
  notes: '',
})

export default function SeedlingsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [items, setItems]       = useState<SeedlingInventory[]>([])
  const [summary, setSummary]   = useState<SeedlingSummaryItem[]>([])
  const [sites, setSites]       = useState<RestorationSite[]>([])
  const [species, setSpecies]   = useState<MangroveSpecies[]>([])
  const [nurseries, setNurseries] = useState<Nursery[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing]   = useState<SeedlingInventory | null>(null)
  const [form, setForm]         = useState<FormState>(emptyForm())
  const [errors, setErrors]     = useState<FormErrors>({})
  // Multi-species rows for the "add" form (one inventory entry is created per
  // row on submit). Not used when editing an existing single-species entry.
  const [speciesRows, setSpeciesRows] = useState<SpeciesRow[]>([])
  const [rowErrors, setRowErrors]     = useState<Record<string, string>>({})
  const [saving, setSaving]     = useState(false)
  const [siteFilter, setSiteFilter] = useState('')
  // Period filter for daily / weekly / monthly inventory tracking.
  const [periodFilter, setPeriodFilter] = useState<'all' | 'daily' | 'weekly' | 'monthly'>('all')
  const [periodSummary, setPeriodSummary] = useState<InventoryPeriodSummary | null>(null)
  const [exporting, setExporting] = useState(false)
  // Expanded entry (movement ledger) + live ledger totals keyed by entry id, so
  // the row shows one consistent set of numbers derived from the ledger.
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [balances, setBalances] = useState<Record<number, number>>({})
  const [ledgerTotals, setLedgerTotals] = useState<Record<number, { planted_out: number; lost: number; stock_in: number }>>({})

  const isManager = ['admin', 'staff', 'menro'].includes(user?.role ?? '')

  useEffect(() => {
    if (authLoading) return
    if (!user) { router.replace('/login'); return }
    if (!isManager) { router.replace('/login'); return }
    Promise.all([fetchSeedlings(), fetchSites(), fetchSeedlingSummary(), fetchSpecies(), fetchNurseries()])
      .then(([inv, s, sum, sp, nur]) => {
        setItems(inv.data ?? inv); setSites(s); setSummary(sum); setSpecies(sp); setNurseries(nur)
      })
      .catch(() => toast.error('Failed to load inventory'))
      .finally(() => setLoading(false))
  }, [authLoading, user]) // eslint-disable-line

  // Reload the table + summary. Pass { unfiltered: true } after creating an
  // entry so a new row (possibly for a site not matching the current filter)
  // is guaranteed to show — otherwise an active site filter could hide it.
  const load = (opts?: { unfiltered?: boolean }) => {
    const siteId = opts?.unfiltered ? undefined : (siteFilter ? parseInt(siteFilter) : undefined)
    return Promise.all([fetchSeedlings(siteId ? { site_id: siteId } : {}), fetchSeedlingSummary(siteId)])
      .then(([inv, sum]) => { setItems(inv.data ?? inv); setSummary(sum) })
      .catch(() => toast.error('Reload failed'))
  }

  // Load the period movement summary whenever the period or site filter changes.
  useEffect(() => {
    if (!isManager) return
    const siteId = siteFilter ? parseInt(siteFilter) : undefined
    fetchInventoryPeriodSummary(periodFilter, siteId)
      .then(setPeriodSummary)
      .catch(() => setPeriodSummary(null))
  }, [periodFilter, siteFilter, isManager]) // eslint-disable-line

  const openNew  = () => { setEditing(null); setForm(emptyForm()); setSpeciesRows([]); setErrors({}); setRowErrors({}); setShowForm(true) }
  const openEdit = (item: SeedlingInventory) => {
    setEditing(item)
    setErrors({})
    setRowErrors({})
    setSpeciesRows([])
    setForm({
      restoration_site_id: String(item.restoration_site_id ?? ''),
      species_name:      item.species_name,
      source_nursery:    item.source_nursery ?? '',
      date_received:     item.date_received,
      beginning_stock:   String(item.beginning_stock ?? 0),
      quantity_received: String(item.quantity_received),
      quantity_planted:  String(item.quantity_planted),
      quantity_damaged:  String(item.quantity_damaged),
      stage:     (STAGE_OPTIONS.some(s => s.value === item.stage) ? item.stage : 'seedling') as SeedlingStageValue,
      notes:     item.notes ?? '',
    })
    setShowForm(true)
  }

  /** Add/remove a species from the multi-select "add" form. */
  function toggleSpecies(name: string) {
    setSpeciesRows(rows =>
      rows.some(r => r.species_name === name)
        ? rows.filter(r => r.species_name !== name)
        : [...rows, emptySpeciesRow(name)]
    )
    setErrors(x => ({ ...x, species_name: undefined }))
  }

  /** Update one quantity field of a species row. */
  function updateRow(name: string, field: keyof SpeciesRow, value: string) {
    setSpeciesRows(rows => rows.map(r => (r.species_name === name ? { ...r, [field]: value } : r)))
    setRowErrors(e => { const n = { ...e }; delete n[name]; return n })
  }

  /** Validate the shared fields + all species rows for the multi-species add form. */
  function validateMulti(f: FormState, rows: SpeciesRow[]): { formErr: FormErrors; rowErr: Record<string, string> } {
    const formErr: FormErrors = {}
    if (!f.source_nursery)      formErr.source_nursery = 'Select a nursery.'
    if (!f.restoration_site_id) formErr.restoration_site_id = 'Select a destination site.'
    if (!f.date_received)       formErr.date_received = 'Date is required.'
    if (!f.stage)               formErr.stage = 'Select a stage.'
    if (rows.length === 0)      formErr.species_name = 'Select at least one species.'

    const rowErr: Record<string, string> = {}
    for (const r of rows) {
      const received = parseInt(r.quantity_received)
      const planted  = parseInt(r.quantity_planted || '0')
      const damaged  = parseInt(r.quantity_damaged || '0')
      if (!r.quantity_received || isNaN(received) || received < 1) {
        rowErr[r.species_name] = 'Enter a quantity received of at least 1.'
      } else if (isNaN(planted) || planted < 0 || isNaN(damaged) || damaged < 0) {
        rowErr[r.species_name] = 'Quantities cannot be negative.'
      } else if (planted + damaged > received) {
        rowErr[r.species_name] = 'Planted + damaged cannot exceed received.'
      }
    }
    return { formErr, rowErr }
  }

  /** Validate the form; returns the error map (empty = valid). */
  function validateForm(f: FormState): FormErrors {
    const e: FormErrors = {}
    const received = parseInt(f.quantity_received)
    const planted  = parseInt(f.quantity_planted || '0')
    const damaged  = parseInt(f.quantity_damaged || '0')

    if (!f.source_nursery)       e.source_nursery = 'Select a nursery.'
    if (!f.restoration_site_id)  e.restoration_site_id = 'Select a destination site.'
    if (!f.species_name)         e.species_name = 'Select a species.'
    if (!f.date_received)        e.date_received = 'Date is required.'
    if (!f.quantity_received || isNaN(received) || received < 1)
      e.quantity_received = 'Enter a quantity of at least 1.'
    if (!f.stage)                e.stage = 'Select a stage.'

    if (f.quantity_planted !== '' && (isNaN(planted) || planted < 0))
      e.quantity_planted = 'Cannot be negative.'
    if (f.quantity_damaged !== '' && (isNaN(damaged) || damaged < 0))
      e.quantity_damaged = 'Cannot be negative.'

    // Planted + damaged must not exceed received.
    if (!isNaN(received) && !isNaN(planted) && !isNaN(damaged) && planted + damaged > received)
      e.quantity_planted = 'Planted + damaged cannot exceed quantity received.'

    return e
  }

  const handleDelete = async (item: SeedlingInventory) => {
    if (!confirm(`Delete entry for "${item.species_name}"?`)) return
    try {
      await deleteSeedlingEntry(item.id)
      toast.success('Entry deleted')
      load()
    } catch { toast.error('Delete failed') }
  }

  // ── Edit mode: update a single existing entry ───────────────────────────────
  const handleUpdate = async () => {
    const e = validateForm(form)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error('Please fix the highlighted fields.'); return }
    setSaving(true)
    try {
      await updateSeedlingEntry(editing!.id, {
        restoration_site_id: parseInt(form.restoration_site_id),
        species_name:      form.species_name,
        source_nursery:    form.source_nursery,
        date_received:     form.date_received,
        quantity_received: parseInt(form.quantity_received),
        quantity_planted:  parseInt(form.quantity_planted)  || 0,
        quantity_damaged:  parseInt(form.quantity_damaged)  || 0,
        stage:     form.stage as import('@/lib/types').SeedlingStage,
        notes:     form.notes || undefined,
      })
      toast.success('Entry updated!')
      setShowForm(false)
      load()
    } catch (err: any) {
      const serverErrors = err?.response?.data?.errors
      if (serverErrors) {
        const mapped: FormErrors = {}
        Object.entries(serverErrors).forEach(([k, v]) => { mapped[k as keyof FormState] = (v as string[])[0] })
        setErrors(mapped)
      }
      toast.error(err?.response?.data?.message ?? 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── Add mode: create one inventory entry per selected species ────────────────
  // Daily inventory-count validation for the single-species Add form.
  function validateDailyCount(f: FormState): FormErrors {
    const e: FormErrors = {}
    const beginning = parseInt(f.beginning_stock || '0') || 0
    const added     = parseInt(f.quantity_received || '0') || 0
    const released  = parseInt(f.quantity_planted || '0') || 0
    const mortality = parseInt(f.quantity_damaged || '0') || 0

    if (!f.species_name) e.species_name = 'Select a species.'
    if (!f.stage)        e.stage = 'Select a stage.'
    if ([beginning, added, released, mortality].some(n => n < 0)) {
      e.quantity_received = 'Quantities cannot be negative.'
    }
    if (released + mortality > beginning + added) {
      e.quantity_planted = 'Released + mortality cannot exceed beginning + added stock.'
    }
    if (released > 0 && !f.restoration_site_id) {
      e.restoration_site_id = 'Select a destination site for the released seedlings.'
    }
    return e
  }

  const handleCreate = async () => {
    const e = validateDailyCount(form)
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error('Please fix the highlighted fields.'); return }

    // Always confirm before adding an entry.
    const ending =
      (parseInt(form.beginning_stock || '0') || 0) +
      (parseInt(form.quantity_received || '0') || 0) -
      (parseInt(form.quantity_damaged || '0') || 0) -
      (parseInt(form.quantity_planted || '0') || 0)
    if (!confirm(
      `Add inventory entry for ${form.species_name}?\n\n` +
      `Beginning: ${form.beginning_stock || 0}\n` +
      `Added: ${form.quantity_received || 0}\n` +
      `Mortality: ${form.quantity_damaged || 0}\n` +
      `Released: ${form.quantity_planted || 0}\n` +
      `Ending stock: ${Math.max(0, ending)}`
    )) return

    setSaving(true)
    try {
      await createSeedlingEntry({
        restoration_site_id: form.restoration_site_id ? parseInt(form.restoration_site_id) : undefined,
        species_name:      form.species_name,
        source_nursery:    form.source_nursery || DEFAULT_SOURCE,
        date_received:     form.date_received,
        beginning_stock:   parseInt(form.beginning_stock)  || 0,
        quantity_received: parseInt(form.quantity_received) || 0,
        quantity_planted:  parseInt(form.quantity_planted)  || 0,
        quantity_damaged:  parseInt(form.quantity_damaged)  || 0,
        stage:     form.stage as import('@/lib/types').SeedlingStage,
        notes:     form.notes || undefined,
      } as any)
      toast.success('Entry added!')
      setShowForm(false)
      setSiteFilter('')
      await load({ unfiltered: true })
    } catch (err: any) {
      const serverErrors = err?.response?.data?.errors
      if (serverErrors) {
        const mapped: FormErrors = {}
        Object.entries(serverErrors).forEach(([k, v]) => { mapped[k as keyof FormState] = (v as string[])[0] })
        setErrors(mapped)
      }
      toast.error(err?.response?.data?.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const handleSave = () => (editing ? handleUpdate() : handleCreate())

  if (authLoading || loading) return (
    <SidebarLayout title="Inventory" subtitle="Track seedlings from nursery to planting">
      <div className="page-container"><LoadingSpinner /></div>
    </SidebarLayout>
  )

  const totalReceived  = summary.reduce((s, r) => s + r.total_received,  0)
  const totalPlanted   = summary.reduce((s, r) => s + r.total_planted,   0)
  const totalRemaining = summary.reduce((s, r) => s + r.total_remaining, 0)

  // ── Period filter (daily / weekly / monthly) over the entry's date_received ──
  const periodCutoff = (p: typeof periodFilter): number | null => {
    if (p === 'all') return null
    const d = new Date()
    if (p === 'daily')   d.setHours(0, 0, 0, 0)
    if (p === 'weekly')  d.setDate(d.getDate() - 7)
    if (p === 'monthly') d.setMonth(d.getMonth() - 1)
    return d.getTime()
  }
  const cutoff = periodCutoff(periodFilter)
  const visibleItems = cutoff == null
    ? items
    : items.filter(it => {
        const t = new Date(it.date_received).getTime()
        return !Number.isNaN(t) && t >= cutoff
      })

  // ── Downloadable inventory report (PDF) for the MENRO Provincial report ──────
  async function exportInventoryPdf() {
    setExporting(true)
    const t = toast.loading('Building inventory PDF…')
    try {
      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()
      const brand: [number, number, number] = [26, 71, 49]
      const periodLabel = periodFilter === 'all' ? 'All records'
        : periodFilter.charAt(0).toUpperCase() + periodFilter.slice(1)

      doc.setFillColor(...brand); doc.rect(0, 0, pageW, 22, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.setFont('helvetica', 'bold')
      doc.text('BAKAWATCH — Mangrove Inventory Report', 14, 10)
      doc.setFontSize(8); doc.setFont('helvetica', 'normal')
      doc.text('Municipal Environment & Natural Resources Office (MENRO) · LGU Gloria, Oriental Mindoro', 14, 15.5)
      doc.setFontSize(7.5)
      doc.text(`Period: ${periodLabel} · ${visibleItems.length} entries · Generated ${new Date().toLocaleString('en-PH')}`, 14, 19.5)
      doc.setTextColor(0, 0, 0)

      let tableStartY = 27

      // ── Movement summary for the selected period (from the ledger) ──────────
      // Reflects real stock movements in-window, which is what MENRO reports to
      // the Provincial office. Fetched fresh so the PDF matches current data.
      if (periodFilter !== 'all') {
        let summary = periodSummary
        try {
          summary = await fetchInventoryPeriodSummary(periodFilter, siteFilter ? parseInt(siteFilter) : undefined)
        } catch { /* fall back to the already-loaded summary */ }
        if (summary) {
          doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...brand)
          doc.text(`Stock Movements — ${periodLabel}`, 14, tableStartY + 2)
          doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal')
          autoTable(doc, {
            startY: tableStartY + 5,
            head: [['Stock In', 'Planted Out', 'Lost', 'Net Change']],
            body: [[
              `+${summary.stock_in}`, `-${summary.planted_out}`, `-${summary.lost}`,
              `${summary.net_change >= 0 ? '+' : ''}${summary.net_change}`,
            ]],
            theme: 'grid', showHead: true,
            headStyles: { fillColor: brand, textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'center' },
            bodyStyles: { fontSize: 10, fontStyle: 'bold', halign: 'center' },
            margin: { left: 14, right: 14 },
            tableWidth: 160,
          })
          tableStartY = (doc as any).lastAutoTable.finalY + 8
        }
      }

      autoTable(doc, {
        startY: tableStartY,
        head: [['No.', 'Mangrove Species', 'Zonation', 'Seedling Source', 'Destination Site', 'Date', 'Received', 'Planted', 'Damaged', 'Balance', 'Remarks']],
        body: visibleItems.map((it, i) => {
          const lt = ledgerTotals[it.id]
          return [
            i + 1, it.species_name, zonationLabel(it.species_name),
            it.source_nursery ?? '—', it.site?.name ?? '—', formatDate(it.date_received),
            it.quantity_received,
            lt ? lt.planted_out : (it.ledger_planted ?? it.quantity_planted),
            lt ? lt.lost : (it.ledger_lost ?? it.quantity_damaged),
            balances[it.id] ?? it.balance ?? it.quantity_remaining, it.notes ?? '—',
          ]
        }),
        theme: 'striped', showHead: 'everyPage',
        headStyles: { fillColor: brand, textColor: 255, fontSize: 7.5, fontStyle: 'bold' },
        bodyStyles: { fontSize: 7.5 },
        alternateRowStyles: { fillColor: [247, 250, 248] },
        columnStyles: { 0: { cellWidth: 10 }, 1: { fontStyle: 'italic' } },
        margin: { left: 14, right: 14 },
      })

      // Totals footer
      const y = (doc as any).lastAutoTable.finalY + 6
      doc.setFontSize(9); doc.setFont('helvetica', 'bold')
      const tR = visibleItems.reduce((s, r) => s + r.quantity_received, 0)
      const tP = visibleItems.reduce((s, r) => s + (ledgerTotals[r.id]?.planted_out ?? r.ledger_planted ?? r.quantity_planted), 0)
      const tD = visibleItems.reduce((s, r) => s + (ledgerTotals[r.id]?.lost ?? r.ledger_lost ?? r.quantity_damaged), 0)
      const tB = visibleItems.reduce((s, r) => s + (balances[r.id] ?? r.balance ?? r.quantity_remaining), 0)
      doc.text(`Totals — Received: ${tR}   Planted: ${tP}   Damaged: ${tD}   Balance: ${tB}`, 14, y)

      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
        doc.text(`Page ${i} of ${pages}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: 'right' })
      }
      doc.save(`mangrove-inventory-${periodFilter}-${new Date().toISOString().split('T')[0]}.pdf`)
      toast.success('Inventory PDF downloaded', { id: t })
    } catch {
      toast.error('Could not build the PDF', { id: t })
    } finally { setExporting(false) }
  }

  return (
    <SidebarLayout title="Inventory" subtitle="Track seedlings from nursery to planting site">
      <div className="page-container space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Received',  value: totalReceived,  color: 'text-blue-600',    bg: 'bg-blue-50',    border: 'border-l-4 border-blue-500' },
            { label: 'Total Planted',   value: totalPlanted,   color: 'text-green-600',   bg: 'bg-green-50',   border: 'border-l-4 border-green-500' },
            { label: 'Remaining Stock', value: totalRemaining, color: 'text-primary-600', bg: 'bg-primary-50', border: 'border-l-4 border-primary-500' },
            { label: 'Identified Species', value: summary.length, color: 'text-purple-600',  bg: 'bg-purple-50',  border: 'border-l-4 border-purple-500' },
          ].map(s => (
            <div key={s.label} className={`card ${s.border} ${s.bg}`}>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter + Add button */}
        <div className="flex items-center gap-3 flex-wrap">
          <select className="input max-w-xs" value={siteFilter} onChange={e => setSiteFilter(e.target.value)}>
            <option value="">All Sites</option>
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button onClick={() => load()} className="btn-secondary text-sm">Filter</button>

          {/* Period tracking — daily / weekly / monthly */}
          <div className="inline-flex items-center rounded-xl border border-gray-200 bg-white p-0.5">
            {([
              { key: 'all',     label: 'All' },
              { key: 'daily',   label: 'Daily' },
              { key: 'weekly',  label: 'Weekly' },
              { key: 'monthly', label: 'Monthly' },
            ] as const).map(p => (
              <button
                key={p.key}
                onClick={() => setPeriodFilter(p.key)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  periodFilter === p.key ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-50',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <button onClick={exportInventoryPdf} disabled={exporting || visibleItems.length === 0}
            className="btn-secondary gap-1.5 disabled:opacity-50" title="Download inventory as PDF">
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download
          </button>
          <button onClick={openNew} className="btn-primary gap-1.5">
            <Plus className="w-4 h-4" /> Add Inventory Entry
          </button>
        </div>

        {/* Period movement summary — real stock movements within the window */}
        {periodFilter !== 'all' && periodSummary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Stock In',    value: periodSummary.stock_in,    cls: 'text-green-700',  Icon: ArrowDownCircle },
              { label: 'Planted Out', value: periodSummary.planted_out, cls: 'text-blue-700',   Icon: ArrowUpCircle },
              { label: 'Lost',        value: periodSummary.lost,        cls: 'text-red-600',    Icon: AlertTriangle },
              { label: 'Net Change',  value: periodSummary.net_change,  cls: periodSummary.net_change >= 0 ? 'text-primary-700' : 'text-red-600', Icon: Sprout },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center shrink-0">
                  <s.Icon className={cn('w-4 h-4', s.cls)} />
                </div>
                <div>
                  <p className={cn('text-lg font-extrabold tabular-nums leading-none', s.cls)}>
                    {s.value > 0 && s.label === 'Net Change' ? `+${s.value}` : s.value}
                  </p>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mt-0.5">{s.label} · {periodFilter}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Inventory table — matches reference form columns */}
        {visibleItems.length === 0 ? (
          <div className="text-center py-16">
            <Sprout className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">
              {items.length === 0 ? 'No inventory entries yet' : 'No entries in the selected period'}
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">Seedling Inventory Records</p>
              <p className="text-xs text-gray-400">{visibleItems.length} entr{visibleItems.length !== 1 ? 'ies' : 'y'}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {[
                      'No.',
                      'Mangrove Species',
                      'Zonation',
                      'Seedling Source',
                      'Destination Site',
                      'Date Propagated / Received',
                      'Quantity',
                      'Remarks',
                      'Actions',
                    ].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {visibleItems.map((item, idx) => {
                    const zone = getZonation(item.species_name)
                    const isOpen = expandedId === item.id
                    const lt = ledgerTotals[item.id]
                    // Prefer figures in this order: live totals from an expanded
                    // panel this session → ledger totals from the list endpoint →
                    // the entry snapshot. All three agree until movements are added.
                    const liveBalance = balances[item.id] ?? item.balance ?? item.quantity_remaining
                    const livePlanted = lt ? lt.planted_out : (item.ledger_planted ?? item.quantity_planted)
                    const liveDamaged = lt ? lt.lost : (item.ledger_lost ?? item.quantity_damaged)
                    return (
                      <React.Fragment key={item.id}>
                      <tr className={cn('hover:bg-gray-50 transition-colors', isOpen && 'bg-primary-50/30')}>
                        {/* No. + expand toggle */}
                        <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                          <button
                            onClick={() => setExpandedId(isOpen ? null : item.id)}
                            className="inline-flex items-center gap-1 hover:text-primary-600"
                            title={isOpen ? 'Hide stock movements' : 'Show stock movements'}>
                            {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            {idx + 1}
                          </button>
                        </td>
                        {/* Mangrove Species */}
                        <td className="px-4 py-3 font-medium text-gray-900 italic">{item.species_name}</td>
                        {/* Zonation */}
                        <td className="px-4 py-3 text-xs" title={zone?.habitat ?? undefined}>
                          {zone ? (
                            <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 font-medium">
                              {zone.zone}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        {/* Seedling Source */}
                        <td className="px-4 py-3 text-gray-600 text-xs">{item.source_nursery ?? '—'}</td>
                        {/* Destination Site */}
                        <td className="px-4 py-3 text-gray-600 text-xs">{item.site?.name ?? '—'}</td>
                        {/* Date */}
                        <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatDate(item.date_received)}</td>
                        {/* Quantity + live ledger balance */}
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <p className="text-blue-600 font-semibold text-xs">Rcvd: {item.quantity_received}</p>
                            <p className="text-green-600 text-xs">Planted: {livePlanted}</p>
                            <p className="text-red-500 text-xs">Damaged: {liveDamaged}</p>
                            <p className={cn('text-xs font-bold', liveBalance > 0 ? 'text-primary-600' : 'text-red-500')}>
                              Balance: {liveBalance}
                            </p>
                          </div>
                        </td>
                        {/* Remarks */}
                        <td className="px-4 py-3 text-gray-500 text-xs max-w-[160px]">
                          <span className="line-clamp-2">{item.notes ?? '—'}</span>
                        </td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <button onClick={() => setExpandedId(isOpen ? null : item.id)}
                              className={cn('p-1.5 rounded-lg hover:bg-gray-100', isOpen ? 'text-primary-600 bg-primary-50' : 'text-gray-500')}
                              title="View details">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => openEdit(item)} className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-600" title="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable stock-movement ledger */}
                      {isOpen && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={9} className="px-4 py-4">
                            <InventoryMovementsPanel
                              entryId={item.id}
                              onBalanceChange={(b) => setBalances(prev => ({ ...prev, [item.id]: b }))}
                              onTotalsChange={(tt: LedgerTotals) => setLedgerTotals(prev => ({
                                ...prev,
                                [item.id]: { planted_out: tt.planted_out, lost: tt.lost, stock_in: tt.stock_in },
                              }))}
                            />
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Modal — matches reference form fields */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
              <div>
                <h2 className="font-bold text-gray-900">{editing ? 'Update Inventory Entry' : 'Add Inventory Entry'}</h2>
                {user?.name && (
                  <p className="text-xs text-gray-400 mt-0.5">Prepared by: {user.name}</p>
                )}
              </div>
              <button onClick={() => setShowForm(false)} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">

              {editing ? (
                /* ── Edit mode: keep the original site/nursery/date editing ─── */
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Nursery Location (Source) *</label>
                      <select
                        className={cn('input', errors.source_nursery && 'border-red-300')}
                        value={form.source_nursery}
                        onChange={e => { setForm(f => ({ ...f, source_nursery: e.target.value })); setErrors(x => ({ ...x, source_nursery: undefined })) }}
                      >
                        <option value="" disabled>Select nursery</option>
                        {nurseries.map(n => <option key={n.id} value={n.name}>{n.name}</option>)}
                      </select>
                      {errors.source_nursery && <p className="err-msg">{errors.source_nursery}</p>}
                    </div>
                    <div>
                      <label className="label">Destination Site *</label>
                      <select
                        className={cn('input', errors.restoration_site_id && 'border-red-300')}
                        value={form.restoration_site_id}
                        onChange={e => { setForm(f => ({ ...f, restoration_site_id: e.target.value })); setErrors(x => ({ ...x, restoration_site_id: undefined })) }}
                      >
                        <option value="" disabled>Select restoration site</option>
                        {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      {errors.restoration_site_id && <p className="err-msg">{errors.restoration_site_id}</p>}
                    </div>
                  </div>

                  <div>
                    <label className="label">Date Propagated / Received *</label>
                    <input
                      type="date"
                      className={cn('input', errors.date_received && 'border-red-300')}
                      value={form.date_received}
                      onChange={e => { setForm(f => ({ ...f, date_received: e.target.value })); setErrors(x => ({ ...x, date_received: undefined })) }}
                    />
                    {errors.date_received && <p className="err-msg">{errors.date_received}</p>}
                  </div>

                  <div>
                    <label className="label">Mangrove Species *</label>
                    <select
                      className={cn('input', errors.species_name && 'border-red-300')}
                      value={form.species_name}
                      onChange={e => { setForm(f => ({ ...f, species_name: e.target.value })); setErrors(x => ({ ...x, species_name: undefined })) }}
                    >
                      <option value="" disabled>Select species</option>
                      {species.map(sp => (
                        <option key={sp.id} value={sp.scientific_name}>
                          {sp.scientific_name}{sp.local_name ? ` / ${sp.local_name}` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.species_name && <p className="err-msg">{errors.species_name}</p>}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {([
                      { key: 'quantity_received' as const, label: 'Received *', min: 1 },
                      { key: 'quantity_planted'  as const, label: 'Planted',    min: 0 },
                      { key: 'quantity_damaged'  as const, label: 'Damaged',    min: 0 },
                    ]).map(({ key, label, min }) => {
                      const step = (delta: number) => {
                        const next = Math.max(min, (parseInt(form[key] || '0') || 0) + delta)
                        setForm(f => ({ ...f, [key]: String(next) }))
                        setErrors(x => ({ ...x, [key]: undefined, quantity_planted: undefined }))
                      }
                      const hasErr = key === 'quantity_damaged' ? errors.quantity_damaged
                        : key === 'quantity_planted' ? errors.quantity_planted : errors.quantity_received
                      return (
                        <div key={key}>
                          <label className="label">{label}</label>
                          {/* Inventory-style −/+ stepper */}
                          <div className={cn('flex items-stretch rounded-xl border overflow-hidden', hasErr ? 'border-red-300' : 'border-gray-200')}>
                            <button type="button" onClick={() => step(-1)}
                              className="px-2 bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                              disabled={(parseInt(form[key] || '0') || 0) <= min} aria-label={`Decrease ${label}`}>
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input type="number" min={min}
                              className="w-full text-center text-sm py-2 outline-none"
                              placeholder={min === 1 ? 'e.g. 100' : '0'}
                              value={form[key]}
                              onChange={e => { setForm(f => ({ ...f, [key]: e.target.value })); setErrors(x => ({ ...x, [key]: undefined, quantity_planted: undefined })) }} />
                            <button type="button" onClick={() => step(1)}
                              className="px-2 bg-gray-50 text-gray-500 hover:bg-gray-100" aria-label={`Increase ${label}`}>
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {key === 'quantity_received' && errors.quantity_received && <p className="err-msg">{errors.quantity_received}</p>}
                        </div>
                      )
                    })}
                  </div>
                  {errors.quantity_planted && <p className="err-msg -mt-2">{errors.quantity_planted}</p>}
                </>
              ) : (
                /* ── Add mode: multi-select species, quantity per species ───── */
                /* ── Add mode: daily inventory count (single species) ───────── */
                <>
                  {/* Date (auto) + Source (auto, single LGU nursery) */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Date</label>
                      <input type="date" className="input bg-gray-50 text-gray-600" value={form.date_received} readOnly />
                      <p className="text-[11px] text-gray-400 mt-1">Set automatically to today.</p>
                    </div>
                    <div>
                      <label className="label">Source</label>
                      <input className="input bg-gray-50 text-gray-600" value={form.source_nursery} readOnly />
                      <p className="text-[11px] text-gray-400 mt-1">All seedlings come from the {DEFAULT_SOURCE}.</p>
                    </div>
                  </div>

                  {/* Mangrove species — single-select dropdown (1 species per entry) */}
                  <div>
                    <label className="label">Mangrove Species *</label>
                    <select
                      className={cn('input', errors.species_name && 'border-red-300')}
                      value={form.species_name}
                      onChange={e => { setForm(f => ({ ...f, species_name: e.target.value })); setErrors(x => ({ ...x, species_name: undefined })) }}
                    >
                      <option value="" disabled>Select species</option>
                      {species.map(sp => (
                        <option key={sp.id} value={sp.scientific_name}>
                          {sp.scientific_name}{sp.local_name ? ` / ${sp.local_name}` : ''}
                        </option>
                      ))}
                    </select>
                    {errors.species_name && <p className="err-msg">{errors.species_name}</p>}
                  </div>

                  {/* Zonation — auto from the selected species, with description */}
                  {(() => {
                    const z = getZonation(form.species_name)
                    return (
                      <div>
                        <label className="label">Zonation</label>
                        <input className="input bg-gray-50 text-gray-700"
                          value={z ? z.simple : (form.species_name ? '—' : '')}
                          placeholder="Auto-filled from the selected species" readOnly />
                        {z && (
                          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
                            {ZONE_DESCRIPTIONS[z.simple]}
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Beginning stock */}
                  <StepperField label="Beginning Stock" value={form.beginning_stock} min={0}
                    onChange={v => setForm(f => ({ ...f, beginning_stock: v }))}
                    hint="Current number of seedlings on hand before this count." />

                  {/* Added stock */}
                  <StepperField label="Added Stock" value={form.quantity_received} min={0}
                    error={errors.quantity_received}
                    onChange={v => { setForm(f => ({ ...f, quantity_received: v })); setErrors(x => ({ ...x, quantity_received: undefined, quantity_planted: undefined })) }}
                    hint="New seedlings received into stock." />

                  {/* Mortality + Released side by side */}
                  <div className="grid grid-cols-2 gap-4">
                    <StepperField label="Mortality" value={form.quantity_damaged} min={0}
                      onChange={v => { setForm(f => ({ ...f, quantity_damaged: v })); setErrors(x => ({ ...x, quantity_planted: undefined })) }}
                      hint="Seedlings that died." />
                    <StepperField label="Released" value={form.quantity_planted} min={0}
                      error={errors.quantity_planted}
                      onChange={v => {
                        setForm(f => ({ ...f, quantity_planted: v, ...(parseInt(v || '0') ? {} : { restoration_site_id: '' }) }))
                        setErrors(x => ({ ...x, quantity_planted: undefined, restoration_site_id: undefined }))
                      }}
                      hint="Seedlings released for planting." />
                  </div>

                  {/* Destination site — disabled when Released = 0 */}
                  {(() => {
                    const released = parseInt(form.quantity_planted || '0') || 0
                    const disabled = released <= 0
                    return (
                      <div>
                        <label className="label">Destination Site {released > 0 && '*'}</label>
                        <select
                          className={cn('input', errors.restoration_site_id && 'border-red-300', disabled && 'bg-gray-100 text-gray-400 cursor-not-allowed')}
                          value={form.restoration_site_id}
                          disabled={disabled}
                          onChange={e => { setForm(f => ({ ...f, restoration_site_id: e.target.value })); setErrors(x => ({ ...x, restoration_site_id: undefined })) }}
                        >
                          <option value="">{disabled ? 'No release — not needed' : 'Select restoration site'}</option>
                          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        {errors.restoration_site_id && <p className="err-msg">{errors.restoration_site_id}</p>}
                      </div>
                    )
                  })()}

                  {/* Ending stock — auto-calculated, read-only */}
                  {(() => {
                    const beginning = parseInt(form.beginning_stock || '0') || 0
                    const added     = parseInt(form.quantity_received || '0') || 0
                    const mortality = parseInt(form.quantity_damaged || '0') || 0
                    const released  = parseInt(form.quantity_planted || '0') || 0
                    const ending = Math.max(0, beginning + added - mortality - released)
                    return (
                      <div className="rounded-xl border border-primary-200 bg-primary-50/50 px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-primary-700 uppercase tracking-widest">Ending Stock</p>
                          <p className="text-[11px] text-gray-500 mt-0.5">Beginning + Added − Mortality − Released</p>
                        </div>
                        <p className="text-2xl font-extrabold text-primary-700 tabular-nums">{ending}</p>
                      </div>
                    )
                  })()}

                  {/* Stage */}
                  <div>
                    <label className="label">Stage *</label>
                    <select
                      className={cn('input', errors.stage && 'border-red-300')}
                      value={form.stage}
                      onChange={e => setForm(f => ({ ...f, stage: e.target.value as SeedlingStageValue }))}
                    >
                      {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    {errors.stage && <p className="err-msg">{errors.stage}</p>}
                  </div>
                </>
              )}

              {/* Edit-mode Stage (Add mode renders its own Stage above) */}
              {editing && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Stage *</label>
                    <select
                      className={cn('input', errors.stage && 'border-red-300')}
                      value={form.stage}
                      onChange={e => setForm(f => ({ ...f, stage: e.target.value as SeedlingStageValue }))}
                    >
                      {STAGE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    {errors.stage && <p className="err-msg">{errors.stage}</p>}
                  </div>
                  <div />
                </div>
              )}

              {/* Remarks */}
              <div>
                <label className="label">Remarks <span className="text-gray-400 font-normal normal-case">(optional)</span></label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Observations, special notes..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 sticky bottom-0 bg-white">
              <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary gap-1.5">
                {saving
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
                  : <><CheckCircle2 className="w-4 h-4" /> {editing ? 'Update Entry' : 'Add Entry'}</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  )
}

// Number field with inventory-style −/+ steppers (so the user needn't type).
function StepperField({
  label, value, onChange, min = 0, error, hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  min?: number
  error?: string
  hint?: string
}) {
  const step = (delta: number) => {
    const next = Math.max(min, (parseInt(value || '0') || 0) + delta)
    onChange(String(next))
  }
  return (
    <div>
      <label className="label">{label}</label>
      <div className={cn('flex items-stretch rounded-xl border overflow-hidden bg-white', error ? 'border-red-300' : 'border-gray-200')}>
        <button type="button" onClick={() => step(-1)} disabled={(parseInt(value || '0') || 0) <= min}
          className="px-3 bg-gray-50 text-gray-500 hover:bg-gray-100 disabled:opacity-40" aria-label={`Decrease ${label}`}>
          <Minus className="w-4 h-4" />
        </button>
        <input type="number" min={min} className="w-full text-center text-sm py-2 outline-none"
          value={value} onChange={e => onChange(e.target.value)} />
        <button type="button" onClick={() => step(1)}
          className="px-3 bg-gray-50 text-gray-500 hover:bg-gray-100" aria-label={`Increase ${label}`}>
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {error ? <p className="err-msg">{error}</p> : hint ? <p className="text-[11px] text-gray-400 mt-1">{hint}</p> : null}
    </div>
  )
}
