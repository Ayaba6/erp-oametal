import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { AppContext } from '../../lib/session'
import { btnPrimary, card, input, th } from '../../lib/ui'
import { Article, FINISHES, KINDS, finishLabel, kindInfo, loadArticles, loadStock, num } from './articleData'

const PEN = 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z'

export default function Articles() {
  const ctx = useOutletContext<AppContext>()
  const [rows, setRows] = useState<Article[]>([])
  const [stock, setStock] = useState(new Map<string, number>())
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ search: '', kind: '', finish: '', status: 'active' })
  const [filter, setFilter] = useState(form)

  useEffect(() => {
    Promise.all([loadArticles(), loadStock()]).then(([a, s]) => {
      setRows(a)
      setStock(s)
      setLoading(false)
    })
  }, [])

  const shown = useMemo(() => {
    const q = filter.search.trim().toLowerCase()
    return rows.filter(
      (a) =>
        (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.color ?? '').toLowerCase().includes(q)) &&
        (!filter.kind || a.kind === filter.kind) &&
        (!filter.finish || a.finish === filter.finish) &&
        (!filter.status || (filter.status === 'active') === a.is_active),
    )
  }, [rows, filter])

  const coilCode = (id: string | null) => rows.find((r) => r.id === id)?.code ?? '—'

  function onFilter(e: FormEvent) {
    e.preventDefault()
    setFilter(form)
  }

  const counts = KINDS.map((k) => ({ ...k, n: rows.filter((r) => r.kind === k.value && r.is_active).length }))

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[16px] font-bold text-gray-900">Articles</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {counts.map((c) => `${c.n} ${c.label.toLowerCase()}${c.n > 1 ? 's' : ''}`).join(' · ')}
          </p>
        </div>
        {ctx.can('products.create') && (
          <Link to="/stocks/articles/nouveau" className={btnPrimary}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nouvel article
          </Link>
        )}
      </div>

      <form onSubmit={onFilter} className={`${card} p-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <input
            type="text"
            value={form.search}
            onChange={(e) => setForm({ ...form, search: e.target.value })}
            placeholder="Code, désignation, couleur..."
            className={`${input} lg:col-span-2`}
          />
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={input}>
            <option value="">Tous les types</option>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
          <select value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} className={input}>
            <option value="">Toutes les finitions</option>
            {FINISHES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={input}>
              <option value="active">Actifs</option>
              <option value="inactive">Inactifs</option>
              <option value="">Tous</option>
            </select>
            <button type="submit" className={`${btnPrimary} justify-center`}>
              Filtrer
            </button>
          </div>
        </div>
      </form>

      <div className={`${card} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-[#eef5f0] border-b border-gray-300">
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Désignation</th>
                <th className={th}>Type</th>
                <th className={th}>Finition</th>
                <th className={`${th} text-right`}>Épaisseur</th>
                <th className={`${th} hidden lg:table-cell`}>Bobine</th>
                <th className={`${th} text-right`}>Prix</th>
                <th className={`${th} text-right`}>Stock</th>
                <th className={`${th} text-center`}>Statut</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((a) => {
                const k = kindInfo(a.kind)
                const qty = stock.get(a.id) ?? 0
                const price = a.kind === 'bobine' ? a.purchase_price : a.sale_price
                const low = a.stock_min > 0 && qty < a.stock_min
                return (
                  <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-1.5 font-mono text-[12px] text-gray-700 whitespace-nowrap">{a.code}</td>
                    <td className="px-3 py-1.5">
                      <Link to={`/stocks/articles/${a.id}`} className="font-medium text-gray-900 hover:text-emerald-700">
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium ${k.badge}`}>{k.label}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                      {finishLabel(a.finish)}
                      {a.color && <span className="text-gray-400"> · {a.color}</span>}
                      {a.ral && <span className="text-gray-400"> · RAL{a.ral}</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{a.thickness_mm ? `${num(a.thickness_mm, 2)} mm` : '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-[12px] text-gray-500 hidden lg:table-cell">{a.kind === 'bobine' ? '—' : coilCode(a.coil_product_id)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                      {price ? (
                        <>
                          {num(price)} F<span className="text-gray-400 text-xs"> /{k.unitLabel}</span>
                        </>
                      ) : (
                        <span className="text-amber-600 text-xs">à renseigner</span>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${low ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                      {num(qty, 2)} <span className="text-gray-400 text-xs">{k.unitLabel}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      {a.is_active ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium bg-green-100 text-green-700">Actif</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-medium bg-gray-100 text-gray-500">Inactif</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {ctx.can('products.edit') && (
                        <Link
                          to={`/stocks/articles/${a.id}`}
                          className="inline-flex p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="Modifier"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={PEN} />
                          </svg>
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!loading && shown.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-gray-400">
                    Aucun article.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
