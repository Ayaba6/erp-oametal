import { ReactNode, useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { AppContext } from '../../lib/session'
import { PoStatus, Supplier, dateFr, loadSupplier, money, poStatus } from './achatsData'

type LastPo = { id: string; number: string; issued_at: string; total_ttc: number; status: PoStatus }

const Ico = ({ d, className = 'w-4 h-4' }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
  </svg>
)

export default function FournisseurShow() {
  const { id } = useParams()
  const navigate = useNavigate()
  const ctx = useOutletContext<AppContext>()
  const [s, setS] = useState<Supplier | null>(null)
  const [pos, setPos] = useState<LastPo[]>([])
  const [ask, setAsk] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadSupplier(id!).then(setS)
    supabase
      .from('purchase_orders')
      .select('id, number, issued_at, total_ttc, status')
      .eq('supplier_id', id!)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }) => setPos((data as LastPo[]) ?? []))
  }, [id])

  if (!s) return null
  const initials = s.name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').slice(0, 2).toUpperCase()

  async function remove() {
    const r = await supabase.from('suppliers').delete().eq('id', s!.id)
    setAsk(false)
    if (r.error)
      return setError(r.error.code === '23503' ? 'Impossible : ce fournisseur a déjà des commandes. Passez-le plutôt en Inactif.' : r.error.message)
    navigate('/achats/fournisseurs')
  }

  const row = (label: string, value: ReactNode) =>
    value ? (
      <div>
        <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
        <dd className="mt-0.5 text-gray-900">{value}</dd>
      </div>
    ) : null
  const address = [s.address, s.address_line2, [s.quartier, s.city].filter(Boolean).join(', '), [s.region, s.country].filter(Boolean).join(', ')].filter(Boolean)

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-[4px] border border-gray-300 p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <span className="text-orange-700 font-bold text-xl">{initials}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[16px] font-bold text-gray-900">{s.name}</h1>
                <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-orange-100 text-orange-700 font-mono">{s.code}</span>
                {s.is_active ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-green-100 text-green-700">Actif</span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-gray-100 text-gray-600">Inactif</span>
                )}
                <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-blue-100 text-blue-700">
                  {s.type === 'particulier' ? 'Particulier' : 'Entreprise'}
                </span>
                {s.blocage_achat && <span className="inline-flex items-center px-2 py-0.5 rounded-[3px] text-[11px] font-semibold bg-red-100 text-red-700">Achat bloqué</span>}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{[s.trade_name, s.city, s.country].filter(Boolean).join(' · ') || '—'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {ctx.can('purchase_orders.create') && s.is_active && !s.blocage_achat && (
              <Link
                to={`/achats/commandes/nouvelle?fournisseur=${s.id}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white rounded-[4px] text-sm font-medium hover:bg-amber-700 transition-colors"
              >
                <Ico d="M12 4v16m8-8H4" />
                Nouvelle commande
              </Link>
            )}
            {ctx.can('suppliers.edit') && (
              <Link
                to={`/achats/fournisseurs/${s.id}/modifier`}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-700 text-white rounded-[4px] text-sm font-medium hover:bg-emerald-800 transition-colors"
              >
                <Ico d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                Modifier
              </Link>
            )}
            <Link
              to="/achats/fournisseurs"
              className="inline-flex items-center gap-2 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-[4px] text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              <Ico d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              Retour
            </Link>
          </div>
        </div>
      </div>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-[4px] px-4 py-2">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <div className="bg-white rounded-[4px] border border-gray-300 p-5">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Ico className="w-4 h-4 text-emerald-600" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              Coordonnées
            </h2>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {row('Téléphone', s.phone)}
              {row('Mobile', s.mobile)}
              {row('Téléphone secondaire', s.phone2)}
              {row('Email', s.email && <a href={`mailto:${s.email}`} className="text-emerald-700 hover:underline">{s.email}</a>)}
              {row('Site web', s.website)}
              {row('Adresse', address.length ? address.map((l, i) => <span key={i} className="block">{l}</span>) : null)}
              {row('Boîte postale', s.boite_postale)}
              {row('NIF / IFU', s.ifu && <span className="font-mono">{s.ifu}</span>)}
              {row('RCCM', s.rccm && <span className="font-mono">{s.rccm}</span>)}
              {row('Devise', s.currency)}
              {row('Mode de règlement', ({ virement: 'Virement', comptant: 'Comptant', cheque: 'Chèque' } as Record<string, string>)[s.payment_mode] ?? s.payment_mode)}
              {row('Délai de règlement', s.payment_days ? `${s.payment_days} jours` : null)}
              {row('Banque', s.banque)}
              {row('RIB / IBAN', s.rib_iban && <span className="font-mono">{s.rib_iban}</span>)}
              {row('Transporteur', s.transporteur)}
            </dl>
            {s.notes && <p className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 whitespace-pre-line">{s.notes}</p>}
          </div>

          {s.contacts?.length > 0 && (
            <div className="bg-white rounded-[4px] border border-gray-300 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200">
                <h2 className="text-base font-semibold text-gray-900">Contacts</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {s.contacts.map((c, i) => (
                    <tr key={i}>
                      <td className="px-5 py-2 font-medium text-gray-900">
                        {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                        {c.is_primary && <span className="ml-2 text-[10.5px] font-semibold text-emerald-700">Principal</span>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{c.job_title || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{c.phone || '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{c.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="bg-white rounded-[4px] border border-gray-300 p-5 space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Statistiques</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Nb contacts</dt>
                <dd className="font-semibold text-gray-900">{s.contacts?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Nb adresses</dt>
                <dd className="font-semibold text-gray-900">{s.addresses?.length ?? 0}</dd>
              </div>
              <div className="flex justify-between items-center">
                <dt className="text-gray-500">Commandes</dt>
                <dd className="font-semibold text-gray-900">{pos.length}</dd>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <dt className="text-gray-500">Volume commandé</dt>
                <dd className="font-semibold tabular-nums text-gray-900">{money(pos.filter((p) => p.status !== 'annulee').reduce((t, p) => t + Number(p.total_ttc), 0))}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-[4px] border border-gray-300 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Dernières commandes</h2>
            <div className="space-y-2">
              {pos.length === 0 && <p className="text-sm text-gray-400">Aucune commande.</p>}
              {pos.map((p) => {
                const st = poStatus(p.status)
                return (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm">
                    <div>
                      <Link to={`/achats/commandes/${p.id}`} className="font-medium text-emerald-700 hover:text-emerald-900 font-mono text-xs hover:underline">
                        {p.number}
                      </Link>
                      <p className="text-xs text-gray-500">{dateFr(p.issued_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums text-gray-900 text-xs">{money(p.total_ttc)}</p>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${st.badge}`}>{st.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {ctx.can('suppliers.delete') && (
            <div className="bg-white rounded-[4px] border border-red-200 p-5">
              <h2 className="text-base font-semibold text-red-700 mb-2">Zone dangereuse</h2>
              <p className="text-sm text-gray-500 mb-3">Cette action est irréversible.</p>
              {ask ? (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAsk(false)} className="px-3 py-1.5 border border-gray-300 rounded-[4px] text-sm">
                    Non
                  </button>
                  <button type="button" onClick={remove} className="px-3 py-1.5 bg-red-600 text-white rounded-[4px] text-sm font-medium">
                    Oui, supprimer définitivement
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAsk(true)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-[4px] text-sm font-medium hover:bg-red-700 transition-colors"
                >
                  Supprimer ce fournisseur
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
