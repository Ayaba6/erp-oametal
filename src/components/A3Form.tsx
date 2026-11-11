// Éléments de formulaire au style des fiches A3 ERP (sections vertes, champs h-8)
import type { ReactNode, SelectHTMLAttributes } from 'react'

export const fi =
  'w-full h-8 px-2 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400 disabled:bg-gray-50'
export const fnum = `${fi} text-right font-mono tabular-nums`
export const fl = 'block text-[11px] font-bold text-gray-700 mb-1'
export const fta =
  'w-full px-2 py-1.5 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white resize-none focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400'
export const fcheck = 'w-[15px] h-[15px] border-[1.5px] border-gray-400 rounded-[2px] text-emerald-600 focus:ring-1 focus:ring-emerald-400'
export const btnSave =
  'text-[13px] font-semibold text-emerald-700 border border-emerald-500 bg-white hover:bg-emerald-50 px-4 py-1.5 rounded-[4px] transition-colors disabled:opacity-60'
export const btnAbandon =
  'text-[13px] font-semibold text-gray-500 hover:text-gray-700 border border-gray-300 bg-white hover:bg-gray-50 px-4 py-1.5 rounded-[4px] transition-colors'
export const btnAddSmall =
  'text-[12px] font-semibold text-emerald-700 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1 rounded-[3px]'

export function Section({ title, children, right, className = '' }: { title: ReactNode; children: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <section className={`border border-gray-200 rounded-[4px] ${className}`}>
      <div className="px-4 py-1.5 border-b border-gray-200 bg-[#eef5f0] text-[13px] font-bold text-emerald-900 flex items-center justify-between">
        <span>{title}</span>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <label className={fl}>
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      {children}
    </div>
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        {...props}
        className={`appearance-none w-full h-8 py-0 pl-2 pr-8 border border-[#c3d3c9] rounded-[3px] text-[13px] bg-white focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-400 disabled:bg-gray-50 ${className}`}
      >
        {children}
      </select>
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none text-[11px]">▾</span>
    </div>
  )
}

// Carte d'en-tête de formulaire : titre + Enregistrer / Abandon
export function FormCard({ title, onAbandon, saving, children }: { title: string; onAbandon: () => void; saving?: boolean; children: ReactNode }) {
  return (
    <div className="bg-white border border-gray-300 rounded-[4px]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 bg-gradient-to-b from-gray-50 to-white">
        <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
        <div className="flex items-center gap-2">
          <button type="submit" disabled={saving} className={btnSave}>
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
          <button type="button" onClick={onAbandon} className={btnAbandon}>
            Abandon
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: [T, string][]; value: T; onChange: (t: T) => void }) {
  return (
    <nav className="flex items-stretch border-b border-gray-200 px-2 overflow-x-auto">
      {tabs.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          className={`px-3 py-1.5 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap ${
            value === k ? 'border-emerald-600 text-emerald-800' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          {l}
        </button>
      ))}
    </nav>
  )
}
