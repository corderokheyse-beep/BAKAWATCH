'use client'

import { useEffect, useState } from 'react'
import {
  fetchInventoryMovements, addInventoryMovement, deleteInventoryMovement,
} from '@/lib/mangrove-api'
import type { InventoryMovement, InventoryMovementType } from '@/lib/types'
import { formatDate, cn } from '@/lib/utils'
import {
  Plus, Minus, Loader2, Trash2, ArrowDownCircle, ArrowUpCircle, AlertTriangle, SlidersHorizontal,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Visual config per movement type. `sign` is how the type affects the balance.
const TYPE_UI: Record<InventoryMovementType, { label: string; sign: '+' | '-' | '±'; cls: string; Icon: any }> = {
  stock_in:    { label: 'Stock in',    sign: '+', cls: 'text-green-700 bg-green-50 border-green-200',  Icon: ArrowDownCircle },
  dispatch_out:{ label: 'Dispatched',  sign: '-', cls: 'text-violet-700 bg-violet-50 border-violet-200', Icon: ArrowUpCircle },
  returned_in: { label: 'Returned',    sign: '+', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200', Icon: ArrowDownCircle },
  planted_out: { label: 'Planted',     sign: '-', cls: 'text-blue-700 bg-blue-50 border-blue-200',     Icon: ArrowUpCircle },
  lost:        { label: 'Lost',        sign: '-', cls: 'text-red-700 bg-red-50 border-red-200',        Icon: AlertTriangle },
  adjustment:  { label: 'Adjustment',  sign: '±', cls: 'text-gray-700 bg-gray-50 border-gray-200',     Icon: SlidersHorizontal },
}

// Per-entry totals derived from the ledger, so the parent row can show one
// consistent set of numbers (received / planted / damaged / balance).
export interface LedgerTotals {
  balance: number
  stock_in: number
  planted_out: number
  dispatch_out: number
  returned_in: number
  lost: number
}

function totalsFrom(movements: InventoryMovement[]): LedgerTotals {
  let stock_in = 0, dispatch_out = 0, returned_in = 0, planted_out = 0, lost = 0, balance = 0
  for (const m of movements) {
    balance += m.quantity
    if (m.type === 'stock_in') stock_in += m.quantity
    else if (m.type === 'dispatch_out') dispatch_out += Math.abs(m.quantity)
    else if (m.type === 'returned_in') returned_in += m.quantity
    else if (m.type === 'planted_out') planted_out += Math.abs(m.quantity)
    else if (m.type === 'lost') lost += Math.abs(m.quantity)
    else if (m.type === 'adjustment') { // split signed adjustment into the right bucket
      if (m.quantity >= 0) stock_in += m.quantity
      else lost += Math.abs(m.quantity)
    }
  }
  return { balance, stock_in, dispatch_out, returned_in, planted_out, lost }
}

export default function InventoryMovementsPanel({
  entryId,
  onBalanceChange,
  onTotalsChange,
}: {
  entryId: number
  onBalanceChange?: (balance: number) => void
  onTotalsChange?: (totals: LedgerTotals) => void
}) {
  const [movements, setMovements] = useState<InventoryMovement[]>([])
  const [balance, setBalance]     = useState<number>(0)
  const [loading, setLoading]     = useState(true)
  const [busy, setBusy]           = useState(false)

  // Add-movement form
  const [type, setType]   = useState<InventoryMovementType>('stock_in')
  const [qty, setQty]     = useState<string>('1')
  const [date, setDate]   = useState<string>(new Date().toISOString().split('T')[0])
  const [note, setNote]   = useState<string>('')

  const emit = (list: InventoryMovement[], bal: number) => {
    onBalanceChange?.(bal)
    onTotalsChange?.(totalsFrom(list))
  }

  useEffect(() => {
    fetchInventoryMovements(entryId)
      .then(d => { setMovements(d.movements); setBalance(d.balance); emit(d.movements, d.balance) })
      .catch(() => toast.error('Failed to load movement history'))
      .finally(() => setLoading(false))
  }, [entryId]) // eslint-disable-line

  const step = (delta: number) => {
    // For adjustment the value may be signed; for the others we keep it positive.
    const next = (parseInt(qty || '0') || 0) + delta
    setQty(String(type === 'adjustment' ? next : Math.max(1, next)))
  }

  async function submit() {
    const n = parseInt(qty)
    if (!n || Number.isNaN(n) || (type !== 'adjustment' && n < 1)) {
      toast.error('Enter a valid quantity.'); return
    }
    if (type === 'adjustment' && n === 0) { toast.error('Adjustment cannot be zero.'); return }
    setBusy(true)
    try {
      const res = await addInventoryMovement(entryId, {
        type, quantity: n, movement_date: date, note: note.trim() || undefined,
      })
      setMovements(prev => { const next = [res.movement, ...prev]; emit(next, res.balance); return next })
      setBalance(res.balance)
      setQty(type === 'adjustment' ? '0' : '1'); setNote('')
      toast.success('Movement recorded')
    } catch (e: any) {
      const msg = e?.response?.data?.errors?.quantity?.[0]
        ?? e?.response?.data?.message ?? 'Could not record the movement'
      toast.error(msg)
    } finally { setBusy(false) }
  }

  async function remove(m: InventoryMovement) {
    if (!confirm('Remove this movement from the ledger?')) return
    setBusy(true)
    try {
      const res = await deleteInventoryMovement(entryId, m.id)
      setMovements(prev => { const next = prev.filter(x => x.id !== m.id); emit(next, res.balance); return next })
      setBalance(res.balance)
      toast.success('Movement removed')
    } catch (e: any) {
      toast.error(e?.response?.data?.errors?.movement?.[0] ?? e?.response?.data?.message ?? 'Could not remove')
    } finally { setBusy(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-6 text-gray-400">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading movement history…
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Current balance + add form */}
      <div className="flex flex-wrap items-end gap-3 bg-gray-50 rounded-xl border border-gray-200 p-3">
        <div className="mr-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Current Balance</p>
          <p className={cn('text-2xl font-extrabold tabular-nums', balance > 0 ? 'text-primary-700' : 'text-red-500')}>
            {balance}
          </p>
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Movement</label>
          <select className="input py-1.5 text-sm mt-0.5" value={type}
            onChange={e => { const t = e.target.value as InventoryMovementType; setType(t); setQty(t === 'adjustment' ? '0' : '1') }}
            disabled={busy}>
            <option value="stock_in">Stock in (+)</option>
            <option value="planted_out">Planted (−)</option>
            <option value="lost">Lost / damaged (−)</option>
            <option value="adjustment">Adjustment (±)</option>
          </select>
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Quantity</label>
          <div className="flex items-stretch rounded-lg border border-gray-200 overflow-hidden mt-0.5 bg-white">
            <button type="button" onClick={() => step(-1)} disabled={busy}
              className="px-2 bg-gray-50 text-gray-500 hover:bg-gray-100" aria-label="Decrease">
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input type="number" className="w-20 text-center text-sm py-1.5 outline-none"
              value={qty} onChange={e => setQty(e.target.value)} disabled={busy} />
            <button type="button" onClick={() => step(1)} disabled={busy}
              className="px-2 bg-gray-50 text-gray-500 hover:bg-gray-100" aria-label="Increase">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Date</label>
          <input type="date" className="input py-1.5 text-sm mt-0.5" value={date}
            onChange={e => setDate(e.target.value)} disabled={busy} />
        </div>

        <div className="flex-1 min-w-[140px]">
          <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Note</label>
          <input className="input py-1.5 text-sm mt-0.5 w-full" placeholder="Optional"
            value={note} onChange={e => setNote(e.target.value)} disabled={busy} />
        </div>

        <button onClick={submit} disabled={busy}
          className="btn-primary text-sm gap-1.5 h-[38px]">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Record
        </button>
      </div>

      {/* Ledger */}
      {movements.length === 0 ? (
        <p className="text-center text-xs text-gray-400 py-4">No movements recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-left py-2 px-2">Type</th>
                <th className="text-right py-2 px-2">Qty</th>
                <th className="text-left py-2 px-2">By</th>
                <th className="text-left py-2 px-2">Note</th>
                <th className="py-2 px-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.map(m => {
                const ui = TYPE_UI[m.type]
                return (
                  <tr key={m.id} className="hover:bg-gray-50/60">
                    <td className="py-2 px-2 text-xs text-gray-500 whitespace-nowrap">{formatDate(m.movement_date)}</td>
                    <td className="py-2 px-2">
                      <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', ui.cls)}>
                        <ui.Icon className="w-3 h-3" /> {ui.label}
                      </span>
                    </td>
                    <td className={cn('py-2 px-2 text-right font-bold tabular-nums text-xs',
                      m.quantity > 0 ? 'text-green-700' : 'text-red-600')}>
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </td>
                    <td className="py-2 px-2 text-xs text-gray-500">{m.recorder?.name ?? '—'}</td>
                    <td className="py-2 px-2 text-xs text-gray-500 max-w-[180px]"><span className="line-clamp-1">{m.note ?? '—'}</span></td>
                    <td className="py-2 px-2 text-right">
                      <button onClick={() => remove(m)} disabled={busy}
                        className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50" title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
