import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Icon from './Icon'
import { ICONS, labelFor } from '../lib/menu'
import { AppContext, initials } from '../lib/session'
import { supabase } from '../lib/supabase'
import { usePwa } from '../lib/pwa'

export default function Layout({ ctx }: { ctx: AppContext }) {
  const { pathname } = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const pwa = usePwa()
  const [iosHelp, setIosHelp] = useState(false)

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
        <header className="safe-top sticky top-0 z-10 lg:static min-h-12 bg-[#11181f] text-gray-200 px-3 sm:px-4 lg:px-6 flex items-center justify-between gap-2 py-1.5 sm:py-2">
          <div className="text-sm flex items-center gap-2 min-w-0">
            <button type="button" onClick={() => setMobileOpen(true)} className="lg:hidden p-2 -ml-2 rounded text-gray-200">
              <span className="sr-only">Menu principal</span>
              <Icon d={ICONS.burger} className="w-5 h-5 shrink-0" />
            </button>
            <span className="hidden sm:inline text-gray-400">Accueil</span>
            <span className="hidden sm:inline">/</span>
            <span className="font-semibold text-white truncate">{labelFor(pathname)}</span>
          </div>

          <div className="relative flex items-center gap-3 shrink-0">
            <time className="hidden sm:block text-xs text-gray-300">{today}</time>
            <button type="button" onClick={() => setMenuOpen((o) => !o)} className="flex items-center gap-3 text-left">
              <span className="w-9 h-9 rounded-full bg-violet-600 flex items-center justify-center text-xs font-bold text-white">
                {initials(name)}
              </span>
              <span className="hidden sm:block text-sm">
                <span className="block font-semibold text-white">{name}</span>
                <span className="block text-xs text-gray-400">{role}</span>
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-2 z-40 w-60 bg-white border border-gray-200 rounded-[4px] shadow-lg py-1">
                <p className="px-3 py-1.5 text-xs text-gray-500 truncate">{ctx.email}</p>
                <p className="sm:hidden px-3 pb-1.5 text-sm font-semibold text-gray-800 truncate">
                  {name} <span className="block text-xs font-normal text-gray-500">{role}</span>
                </p>
                {pwa.canInstall && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      pwa.install()
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-emerald-700 font-semibold hover:bg-gray-50"
                  >
                    📲 Installer l'application
                  </button>
                )}
                {pwa.iosHint && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      setIosHelp(true)
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-emerald-700 font-semibold hover:bg-gray-50"
                  >
                    📲 Installer sur l'iPhone
                  </button>
                )}
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

        <main className="min-w-0 flex-1 p-3 sm:p-4 lg:p-6">
          {pwa.updateReady && (
            <div className="mb-3 bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm rounded-[4px] px-4 py-2 flex flex-wrap items-center justify-between gap-2">
              <span>Une nouvelle version de l'ERP est disponible.</span>
              <button type="button" onClick={pwa.update} className="px-3 py-1 bg-emerald-700 text-white rounded-[4px] text-[13px] font-semibold">
                Mettre à jour
              </button>
            </div>
          )}
          {iosHelp && (
            <div className="mb-3 bg-white border border-emerald-300 text-sm rounded-[4px] px-4 py-3 space-y-1">
              <p className="font-semibold text-gray-900">Installer l'ERP sur l'iPhone / iPad</p>
              <p className="text-gray-700">Dans Safari, touchez le bouton Partager (carré avec une flèche), puis « Sur l'écran d'accueil » et « Ajouter ».</p>
              <button type="button" onClick={() => setIosHelp(false)} className="text-emerald-700 font-semibold text-[13px]">
                Compris
              </button>
            </div>
          )}
          {ctx.company?.maintenance_mode && !ctx.profile?.is_super && !ctx.can('company.edit') ? (
            <div className="bg-white border border-amber-300 rounded-[4px] p-6 text-center">
              <p className="text-[15px] font-bold text-amber-800">ERP en maintenance</p>
              <p className="text-sm text-gray-600 mt-1">L'accès est temporairement réservé aux administrateurs. Réessayez plus tard.</p>
            </div>
          ) : (
            <Outlet context={ctx} />
          )}
        </main>

        <footer className="safe-bottom bg-white border-t border-gray-200 px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm text-gray-500 flex flex-wrap items-center justify-between gap-1">
          <span>© {year} A3 ERP · Tous droits réservés</span>
          <a href="https://wa.me/22670037622" target="_blank" rel="noreferrer" className="text-emerald-700 hover:text-emerald-900">
            +226 70 03 76 22
          </a>
        </footer>
      </div>
    </div>
  )
}
