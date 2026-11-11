import { ReactNode, useCallback, useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import Chart from 'react-apexcharts'
import type { ApexOptions } from 'apexcharts'
import { DashboardData, loadDashboard, money } from '../lib/dashboard'
import { AppContext } from '../lib/session'

const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.']
const FAMILY_COLORS = ['#1d4ed8', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#db2777']

const btnLight =
  'h-8 inline-flex items-center gap-1.5 border border-gray-300 text-gray-700 hover:bg-gray-50 text-[12px] font-medium px-3 rounded-[4px] transition-colors'

const kFormat = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)} k` : `${Math.round(v)}`)

function StatCard({ icon, tone, label, value, sub }: { icon: string; tone: string; label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-gray-300 rounded-[4px] px-4 py-3 flex items-center gap-3">
      <span className={`w-11 h-11 rounded-full ${tone} flex items-center justify-center shrink-0`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-gray-600">{label}</p>
        <p className="text-[20px] font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
        <p className="text-[11px] text-gray-400">{sub}</p>
      </div>
    </div>
  )
}

function LinkCard({ to, icon, tone, label, value, sub, subClass = 'text-gray-500' }: { to: string; icon: string; tone: string; label: string; value: string; sub: string; subClass?: string }) {
  return (
    <Link to={to} className="bg-white border border-gray-300 rounded-[4px] px-4 py-3 flex items-center gap-3 hover:border-emerald-400 transition-colors group">
      <span className={`w-10 h-10 rounded-[6px] ${tone} flex items-center justify-center shrink-0`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={icon} />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold text-gray-600">{label}</p>
        <p className="text-[20px] font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
        <p className={`text-[11px] ${subClass}`}>{sub}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 transition-colors shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

function Panel({ title, hint, tag, children }: { title: string; hint: string; tag: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-white border border-gray-300 rounded-[4px] p-3">
      <div className="flex flex-wrap gap-2 items-center justify-between mb-1">
        <p className="text-[13px] font-bold text-gray-800">
          {title} <span className="font-normal text-gray-500">{hint}</span>
        </p>
        <span className="text-[11px] text-gray-400 border border-gray-200 rounded-[3px] px-2 py-0.5">{tag}</span>
      </div>
      <div className="min-h-[220px]">{children}</div>
    </div>
  )
}

function Th({ children }: { children: ReactNode }) {
  return <th scope="col" className="px-3 py-1.5 text-left text-[11px] font-semibold text-white uppercase whitespace-nowrap">{children}</th>
}

const levelClass: Record<string, string> = {
  Critique: 'bg-red-600 text-white',
  Avertissement: 'bg-amber-50 text-amber-700 border border-amber-200',
  Information: 'bg-blue-50 text-blue-700 border border-blue-200',
}

const baseChart: ApexOptions = {
  chart: { toolbar: { show: false }, fontFamily: 'Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', zoom: { enabled: false } },
  dataLabels: { enabled: false },
  grid: { borderColor: '#f1f5f9', strokeDashArray: 3 },
  legend: { fontSize: '11px', position: 'bottom' },
  tooltip: { y: { formatter: (v: number) => money(v) } },
}

export default function Dashboard() {
  const ctx = useOutletContext<AppContext>()
  const [includeTest, setIncludeTest] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    setData(await loadDashboard(includeTest))
    setLoading(false)
  }, [includeTest])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const now = new Date()
  const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^./, (c) => c.toUpperCase())
  const year = now.getFullYear()
  const d = data

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">Tableau de bord</h1>
          <p className="text-[12.5px] text-gray-500">Vue synthétique de l'activité de l'entreprise</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor="dashboard-mode" className="sr-only">
            Périmètre des données
          </label>
          <select
            id="dashboard-mode"
            value={includeTest ? 'all' : 'real'}
            onChange={(e) => setIncludeTest(e.target.value === 'all')}
            className="h-8 border border-gray-300 bg-white text-gray-700 text-[12px] rounded-[4px] px-2 pr-8 focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            <option value="real">Données réelles</option>
            <option value="all">Inclure TEST/UAT</option>
          </select>
          <button type="button" className={btnLight} onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Chargement…' : 'Actualiser'}
          </button>
          <Link to="/direction" className={btnLight}>
            Vue Direction
          </Link>
          <Link
            to="/ventes/factures"
            className="h-8 inline-flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] font-semibold px-3 rounded-[4px] transition-colors"
          >
            Nouvelle facture +
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        <StatCard
          tone="bg-blue-100 text-blue-600"
          icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          label="Chiffre d'affaires (HT)"
          value={money(d?.caMonth ?? 0)}
          sub={monthLabel}
        />
        <StatCard
          tone="bg-emerald-100 text-emerald-600"
          icon="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          label="Trésorerie disponible"
          value={money(d?.treasury ?? 0)}
          sub={monthLabel}
        />
        <StatCard tone="bg-indigo-100 text-indigo-600" icon="M16 17l-4 4m0 0l-4-4m4 4V3" label="Encaissements (mois)" value={money(d?.cashInMonth ?? 0)} sub={monthLabel} />
        <StatCard tone="bg-orange-100 text-orange-600" icon="M8 7l4-4m0 0l4 4m-4-4v18" label="Décaissements (mois)" value={money(d?.cashOutMonth ?? 0)} sub={monthLabel} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
        <LinkCard
          to="/ventes/commandes"
          tone="bg-blue-50 text-blue-600"
          icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          label="Commandes en attente"
          value={String(d?.pendingOrders.count ?? 0)}
          sub={money(d?.pendingOrders.amount ?? 0)}
        />
        <LinkCard
          to="/production/of"
          tone="bg-emerald-50 text-emerald-600"
          icon="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          label="OF en cours"
          value={String(d?.ofInProgress.count ?? 0)}
          sub={d && d.ofInProgress.late > 0 ? `Dont ${d.ofInProgress.late} en retard` : 'Aucun retard'}
          subClass={d && d.ofInProgress.late > 0 ? 'text-red-600 font-semibold' : 'text-gray-500'}
        />
        <LinkCard
          to="/stocks/niveaux"
          tone="bg-amber-50 text-amber-600"
          icon="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          label="Stock critique"
          value={String(d?.criticalStock ?? 0)}
          sub="Articles à réappro."
        />
        <LinkCard
          to="/ventes/factures"
          tone="bg-red-50 text-red-500"
          icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          label="Échéances dépassées"
          value={String(d?.overdue.count ?? 0)}
          sub={d && d.overdue.count > 0 ? money(d.overdue.amount) : 'Aucun retard client'}
          subClass={d && d.overdue.count > 0 ? 'text-red-600 font-semibold' : 'text-emerald-600'}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
        <Panel title="Évolution du chiffre d'affaires" hint="(HT)" tag="Année en cours">
          <Chart
            type="bar"
            height={245}
            series={[
              { name: `CA ${year - 1}`, data: d?.caByMonth.previous ?? Array(12).fill(0) },
              { name: `CA ${year}`, data: d?.caByMonth.current ?? Array(12).fill(0) },
            ]}
            options={{
              ...baseChart,
              colors: ['#93c5fd', '#1d4ed8'],
              plotOptions: { bar: { columnWidth: '60%', borderRadius: 2 } },
              xaxis: { categories: MONTHS, labels: { style: { fontSize: '10px' } } },
              yaxis: { labels: { formatter: kFormat, style: { fontSize: '10px' } } },
            }}
          />
        </Panel>

        <Panel title="Trésorerie" hint="(disponible)" tag="30 derniers jours">
          <Chart
            type="line"
            height={245}
            series={[{ name: 'Trésorerie', data: d?.treasury30.values ?? [] }]}
            options={{
              ...baseChart,
              colors: ['#059669'],
              stroke: { curve: 'smooth', width: 2 },
              markers: { size: 3, strokeWidth: 0 },
              xaxis: { categories: d?.treasury30.labels ?? [], tickAmount: 8, labels: { rotate: -45, style: { fontSize: '10px' } } },
              yaxis: { min: 0, labels: { formatter: kFormat, style: { fontSize: '10px' } } },
              legend: { show: false },
            }}
          />
        </Panel>

        <Panel title="Répartition du CA par famille" hint="(YTD)" tag="Année en cours">
          {d && d.caByFamily.values.length > 0 ? (
            <Chart
              type="donut"
              height={230}
              series={d.caByFamily.values}
              options={{
                ...baseChart,
                labels: d.caByFamily.labels.map((l, i) => {
                  const total = d.caByFamily.values.reduce((s, v) => s + v, 0)
                  return `${l} — ${((d.caByFamily.values[i] / total) * 100).toFixed(1).replace('.', ',')} %`
                }),
                colors: FAMILY_COLORS,
                legend: { position: 'bottom', horizontalAlign: 'left', fontSize: '11px' },
                plotOptions: {
                  pie: {
                    donut: {
                      size: '65%',
                      labels: {
                        show: true,
                        name: { show: false },
                        value: { fontSize: '13px', fontWeight: 700, formatter: (v: string) => money(Number(v)) },
                        total: { show: true, showAlways: true, label: 'Total HT', fontSize: '11px', formatter: (w: { globals: { seriesTotals: number[] } }) => money(w.globals.seriesTotals.reduce((s: number, v: number) => s + v, 0)) },
                      },
                    },
                  },
                },
              }}
            />
          ) : (
            <p className="text-[12px] text-gray-400 pt-20 text-center">Aucune facture sur l'année en cours.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        <div className="min-w-0 bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200">
            <p className="text-[13px] font-bold text-gray-800">Activités récentes</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-[12.5px]">
              <thead className="bg-[#3b4248]">
                <tr>
                  <Th>Date/Heure</Th>
                  <Th>Type</Th>
                  <Th>Description</Th>
                  <Th>Tiers / Référence</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(d?.activities ?? []).map((a) => (
                  <tr key={a.type + a.reference} className="odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap">
                      {new Date(a.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' ')}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex px-2 py-0.5 rounded-[3px] text-[10.5px] font-medium border bg-gray-50 text-gray-600 border-gray-200 whitespace-nowrap">{a.type}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-700">{a.description}</td>
                    <td className="px-3 py-1.5">
                      <span className="block font-mono text-[11px] text-blue-700">{a.reference}</span>
                      <span className="block text-[11px] text-gray-500 truncate max-w-[180px]">{a.user}</span>
                    </td>
                  </tr>
                ))}
                {d && d.activities.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                      Aucune activité pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100">
            <Link to="/ventes/factures" className="text-[12px] font-medium text-emerald-700 hover:text-emerald-900">
              Voir toutes les activités →
            </Link>
          </div>
        </div>

        <div className="min-w-0 bg-white border border-gray-300 rounded-[4px] overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-200">
            <p className="text-[13px] font-bold text-gray-800">Alertes et points de vigilance</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead className="bg-[#3b4248]">
                <tr>
                  <Th>Date</Th>
                  <Th>Niveau</Th>
                  <Th>Message</Th>
                  <Th>Module</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(d?.alerts ?? []).map((a) => (
                  <tr key={a.message} className="odd:bg-white even:bg-gray-50/40 hover:bg-emerald-50/50">
                    <td className="px-3 py-1.5 text-gray-500 tabular-nums whitespace-nowrap">{a.date}</td>
                    <td className="px-3 py-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-[3px] text-[10.5px] font-semibold ${levelClass[a.level]}`}>{a.level}</span>
                    </td>
                    <td className="px-3 py-1.5 text-gray-700">
                      <Link to={a.link} className="hover:text-emerald-700">
                        {a.message}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{a.module}</td>
                  </tr>
                ))}
                {d && d.alerts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                      Aucune alerte.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-100">
            <span className="text-[12px] font-medium text-emerald-700">Toutes les notifications →</span>
          </div>
        </div>
      </div>

      <div className="bg-[#232a30] text-gray-300 rounded-[4px] px-4 py-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-[12px]">
        <span>
          Société : <span className="text-white font-semibold">{ctx.company?.name ?? 'OA METAL INDUSTRIE'}</span>
        </span>
        <span className="border-l border-white/10 pl-6">
          Site : <span className="text-white font-semibold">01</span>
        </span>
        <span className="border-l border-white/10 pl-6">
          Exercice : <span className="text-white font-semibold">{year}</span>
        </span>
        <span className="border-l border-white/10 pl-6">
          Périmètre : <span className="text-white font-semibold">{includeTest ? 'Inclure TEST/UAT' : 'Données réelles'}</span>
        </span>
        <span className="border-l border-white/10 pl-6">
          Période du <span className="text-white font-semibold">01/01/{year}</span> au <span className="text-white font-semibold">31/12/{year}</span>
        </span>
        <span className="ml-auto">
          Utilisateur : <span className="text-white font-semibold">{ctx.profile?.full_name ?? ctx.email}</span>
        </span>
        <span className="border-l border-white/10 pl-6 inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400" /> En ligne
        </span>
      </div>
    </div>
  )
}
