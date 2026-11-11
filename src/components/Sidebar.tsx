import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import Icon from './Icon'
import { HOME, ICONS, modules } from '../lib/menu'


type Props = {
  companyName: string
  mobileOpen: boolean
  onCloseMobile: () => void
  can: (code: string) => boolean
}

const isUnder = (pathname: string, path: string) => pathname === path || pathname.startsWith(path + '/')

const topItem =
  'group relative w-full flex items-center gap-3 h-10 px-3 rounded-lg text-base font-semibold transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400'

export default function Sidebar({ companyName, mobileOpen, onCloseMobile, can }: Props) {
  const { pathname } = useLocation()
  // Seuls les écrans autorisés pour le rôle de l'utilisateur sont affichés
  const visibleModules = modules
    .map((m) => ({
      ...m,
      sections: m.sections
        .map((s) => ({ ...s, items: s.items.filter((i) => !i.perm || can(i.perm)) }))
        .filter((s) => s.items.length > 0),
    }))
    .filter((m) => m.sections.length > 0)
  const activeModule = visibleModules.find((m) => m.sections.some((s) => s.items.some((i) => isUnder(pathname, i.path))))
  const [open, setOpen] = useState<string | null>(activeModule?.key ?? null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (activeModule) setOpen(activeModule.key)
  }, [activeModule?.key])

  const homeActive = pathname === HOME.path

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 z-20 bg-black/40 lg:hidden" onClick={onCloseMobile} />}
      <aside
        className={`safe-top bg-[#22282b] text-gray-300 fixed inset-y-0 left-0 z-30 flex flex-col transition-transform duration-300 lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'w-16' : 'w-64'}`}
      >
        <div className="h-12 px-3 flex items-center justify-between gap-2 bg-[#11181f] border-b border-white/10 shrink-0">
          {!collapsed && (
            <span title={companyName} className="text-[#00d639] text-important font-black uppercase tracking-tight truncate">
              {companyName}
            </span>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:flex w-7 h-7 items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/10"
            aria-label="Réduire le menu"
          >
            <Icon d={ICONS.burger} className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" onClick={onCloseMobile} className="lg:hidden text-gray-200 p-2 rounded" aria-label="Fermer le menu">
            <Icon d="M6 18L18 6M6 6l12 12" className="w-5 h-5 shrink-0" />
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-2 space-y-px">
          {(!HOME.perm || can(HOME.perm)) && (
          <Link
            to={HOME.path}
            onClick={onCloseMobile}
            className={`${topItem} ${homeActive ? 'bg-white/10 text-white' : 'text-gray-200 hover:bg-white/10 hover:text-white'}`}
            title={HOME.label}
          >
            {homeActive && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-emerald-400 rounded-r-full" />}
            <Icon d={ICONS.home} className={`w-5 h-5 shrink-0 ${homeActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
            {!collapsed && <span className="truncate">{HOME.label}</span>}
          </Link>
          )}

          {visibleModules.map((m) => {
            const isOpen = open === m.key && !collapsed
            const isActive = activeModule?.key === m.key
            return (
              <div key={m.key}>
                <button
                  type="button"
                  title={m.label}
                  onClick={() => {
                    if (collapsed) setCollapsed(false)
                    setOpen(isOpen ? null : m.key)
                  }}
                  className={`${topItem} ${isActive ? 'text-white' : 'text-gray-200'} hover:bg-white/10 hover:text-white`}
                >
                  <Icon d={m.icon} className={`w-5 h-5 shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
                  {!collapsed && <span className="flex-1 text-left truncate">{m.label}</span>}
                  {!collapsed && (
                    <Icon
                      d={ICONS.chevron}
                      className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180 text-white' : ''}`}
                    />
                  )}
                </button>

                {isOpen && (
                  <div className="ml-3 pl-1.5 border-l border-white/10 py-1">
                    {m.sections.map((s, i) => (
                      <div key={s.title}>
                        <p
                          className={`${i === 0 ? 'pt-1' : 'pt-3'} pb-1 pl-2 pr-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-500`}
                        >
                          {s.title}
                        </p>
                        <div className="space-y-px">
                          {s.items.map((it) => {
                            const active = isUnder(pathname, it.path)
                            return (
                              <Link
                                key={it.path}
                                to={it.path}
                                onClick={onCloseMobile}
                                className={`relative flex items-center gap-2 h-8 pl-2 pr-1 rounded-md text-[12px] font-medium transition-colors duration-100 ${
                                  active ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/10'
                                }`}
                              >
                                <Icon d={ICONS.doc} className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-400' : 'text-gray-500'}`} />
                                <span className="truncate">{it.label}</span>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
