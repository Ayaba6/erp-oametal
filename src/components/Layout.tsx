import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Icon from './Icon'
import { ICONS, labelFor } from '../lib/menu'
import { AppContext, initials } from '../lib/session'
import { supabase } from '../lib/supabase'

export default function Layout({ ctx }: { ctx: AppContext }) {
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const name = ctx.profile?.full_name ?? ctx.email
  const role = ctx.profile?.role_name ?? ''
  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const year = new Date().getFullYear()

  return (
    <div className="min-h-screen bg-[#f5f7fa] lg:flex">
      <Sidebar
        companyName={ctx.company?.name ?? 'OA METAL INDUSTRIE'}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        can={ctx.can}
      />

      <div className="min-w-0 flex-1 flex flex-col">
        <header className="min-h-12 bg-[#11181f] text-gray-200 px-4 lg:px-6 flex items-center justify-between gap-3 flex-wrap py-2">
          <div className="text-sm flex items-center gap-2 min-w-0">
            <button type="button" onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 rounded text-gray-200">
              <span className="sr-only">Menu principal</span>
              <Icon d={ICONS.burger} className="w-5 h-5 shrink-0" />
            </button>
            <span className="text-gray-400">Accueil</span>
            <span>/</span>
            <span className="font-semibold text-white">{labelFor(pathname)}</span>
          </div>

          <div className="relative flex items-center gap-3">
            <time className="hidden sm:block text-xs text-gray-300">{today}</time>
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-3 text-left">
              <span className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {initials(name)}
              </span>
              <span className="text-sm">
                <span className="block font-semibold text-white">{name}</span>
                <span className="block text-xs text-gray-400">{role}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 z-40 w-48 bg-white border border-gray-200 rounded-[4px] shadow-lg py-1">
                <p className="px-3 py-1.5 text-xs text-gray-500 truncate">{ctx.email}</p>
                <button
                  type="button"
                  onClick={() => supabase.auth.signOut()}
                  className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-gray-50"
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          {ctx.company?.maintenance_mode && !ctx.profile?.is_super && !ctx.can('company.edit') ? (
            <div className="bg-white border border-amber-300 rounded-[4px] p-6 text-center">
              <p className="text-[15px] font-bold text-amber-800">ERP en maintenance</p>
              <p className="text-sm text-gray-600 mt-1">L'accès est temporairement réservé aux administrateurs. Réessayez plus tard.</p>
            </div>
          ) : (
            <Outlet context={ctx} />
          )}
        </main>

        <footer className="bg-white border-t border-gray-200 px-6 py-3 text-sm text-gray-500 flex items-center justify-between">
          <span>© {year} A3 ERP · Tous droits réservés</span>
          <a href="https://wa.me/22670037622" target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900">
            +226 70 03 76 22
          </a>
        </footer>
      </div>
    </div>
  )
}
