import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { allItems } from './lib/menu'
import { AppContext, loadContext } from './lib/session'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Placeholder from './pages/Placeholder'
import Users from './pages/parametres/Users'
import UserForm from './pages/parametres/UserForm'
import UserShow from './pages/parametres/UserShow'
import RoleList from './pages/parametres/RoleList'
import RoleShow from './pages/parametres/RoleShow'
import RoleEdit from './pages/parametres/RoleEdit'
import Articles from './pages/stocks/Articles'
import ArticleForm from './pages/stocks/ArticleForm'
import Bobines from './pages/stocks/Bobines'
import BobineForm from './pages/stocks/BobineForm'
import BobineImport from './pages/stocks/BobineImport'
import Depots from './pages/parametres/Depots'
import Mouvements from './pages/stocks/Mouvements'
import TransfertForm from './pages/stocks/TransfertForm'
import TransfertShow from './pages/stocks/TransfertShow'
import Fournisseurs from './pages/achats/Fournisseurs'
import FournisseurForm from './pages/achats/FournisseurForm'
import FournisseurShow from './pages/achats/FournisseurShow'
import Commandes from './pages/achats/Commandes'
import CommandeForm from './pages/achats/CommandeForm'
import CommandeShow from './pages/achats/CommandeShow'
import Receptions from './pages/achats/Receptions'
import ReceptionShow from './pages/achats/ReceptionShow'
import Clients from './pages/ventes/Clients'
import ClientForm from './pages/ventes/ClientForm'
import ClientShow from './pages/ventes/ClientShow'
import SalesDocForm from './pages/ventes/SalesDocForm'
import { CommandesList, DevisList, FacturesList, LivraisonsList } from './pages/ventes/Lists'
import DevisShow from './pages/ventes/DevisShow'
import CommandeClientShow from './pages/ventes/CommandeClientShow'
import LivraisonForm from './pages/ventes/LivraisonForm'
import LivraisonShow from './pages/ventes/LivraisonShow'
import FactureShow from './pages/ventes/FactureShow'
import Caisse from './pages/tresorerie/Caisse'
import Encaissements from './pages/tresorerie/Encaissements'
import Sessions from './pages/tresorerie/Sessions'
import Societe from './pages/parametres/Societe'

// Écrans déjà construits (les autres affichent « Bientôt disponible »)
const BUILT = ['/parametres/utilisateurs', '/parametres/roles', '/stocks/articles', '/stocks/bobines', '/parametres/depots', '/achats/commandes', '/achats/receptions', '/achats/fournisseurs', '/stocks/transferts', '/stocks/mouvements', '/ventes/clients', '/ventes/devis', '/ventes/commandes', '/ventes/livraisons', '/ventes/factures', '/tresorerie/caisse', '/tresorerie/encaissements', '/tresorerie/sessions', '/parametres/societe']

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [ctx, setCtx] = useState<AppContext | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setCtx(null)
      return
    }
    loadContext(session.user.id, session.user.email ?? '').then(setCtx)
  }, [session?.user.id])

  if (!ready) return null
  if (!session) return <Login />
  if (!ctx) return null

  const pages = allItems.filter((it) => it.path !== '/' && !BUILT.includes(it.path))

  return (
    <Routes>
      <Route element={<Layout ctx={ctx} />}>
        <Route index element={<Dashboard />} />
        <Route path="/parametres/utilisateurs" element={<Guard ok={ctx.can('users.manage')}><Users /></Guard>} />
        <Route path="/parametres/utilisateurs/nouveau" element={<Guard ok={ctx.can('users.manage')}><UserForm /></Guard>} />
        <Route path="/parametres/utilisateurs/:id" element={<Guard ok={ctx.can('users.manage')}><UserShow /></Guard>} />
        <Route path="/parametres/utilisateurs/:id/modifier" element={<Guard ok={ctx.can('users.manage')}><UserForm /></Guard>} />
        <Route path="/stocks/articles" element={<Guard ok={ctx.can('products.view')}><Articles /></Guard>} />
        <Route path="/stocks/articles/nouveau" element={<Guard ok={ctx.can('products.create')}><ArticleForm /></Guard>} />
        <Route path="/stocks/articles/:id" element={<Guard ok={ctx.can('products.view')}><ArticleForm /></Guard>} />
        <Route path="/stocks/bobines" element={<Guard ok={ctx.can('stocks.view')}><Bobines /></Guard>} />
        <Route path="/stocks/bobines/nouvelle" element={<Guard ok={ctx.can('receptions.create')}><BobineForm /></Guard>} />
        <Route path="/stocks/bobines/import" element={<Guard ok={ctx.can('receptions.create')}><BobineImport /></Guard>} />
        <Route path="/stocks/bobines/:id" element={<Guard ok={ctx.can('stocks.view')}><BobineForm /></Guard>} />
        <Route path="/achats/fournisseurs" element={<Guard ok={ctx.can('suppliers.view')}><Fournisseurs /></Guard>} />
        <Route path="/achats/fournisseurs/nouveau" element={<Guard ok={ctx.can('suppliers.create')}><FournisseurForm /></Guard>} />
        <Route path="/achats/fournisseurs/:id" element={<Guard ok={ctx.can('suppliers.view')}><FournisseurShow /></Guard>} />
        <Route path="/achats/fournisseurs/:id/modifier" element={<Guard ok={ctx.can('suppliers.edit')}><FournisseurForm /></Guard>} />
        <Route path="/achats/commandes" element={<Guard ok={ctx.can('purchase_orders.view')}><Commandes /></Guard>} />
        <Route path="/achats/commandes/nouvelle" element={<Guard ok={ctx.can('purchase_orders.create')}><CommandeForm /></Guard>} />
        <Route path="/achats/commandes/:id" element={<Guard ok={ctx.can('purchase_orders.view')}><CommandeShow /></Guard>} />
        <Route path="/achats/commandes/:id/modifier" element={<Guard ok={ctx.can('purchase_orders.edit')}><CommandeForm /></Guard>} />
        <Route path="/achats/receptions" element={<Guard ok={ctx.can('receptions.view')}><Receptions /></Guard>} />
        <Route path="/achats/receptions/:id" element={<Guard ok={ctx.can('receptions.view')}><ReceptionShow /></Guard>} />
        <Route path="/stocks/mouvements" element={<Guard ok={ctx.can('stocks.view')}><Mouvements /></Guard>} />
        <Route path="/stocks/transferts" element={<Navigate to="/stocks/mouvements?tab=demandes" replace />} />
        <Route path="/stocks/transferts/nouveau" element={<Guard ok={ctx.can('stocks.transfer')}><TransfertForm /></Guard>} />
        <Route path="/stocks/transferts/:id" element={<Guard ok={ctx.can('stocks.view')}><TransfertShow /></Guard>} />
        <Route path="/stocks/transferts/:id/modifier" element={<Guard ok={ctx.can('stocks.transfer')}><TransfertForm /></Guard>} />
        <Route path="/ventes/clients" element={<Guard ok={ctx.can('clients.view')}><Clients /></Guard>} />
        <Route path="/ventes/clients/nouveau" element={<Guard ok={ctx.can('clients.create')}><ClientForm /></Guard>} />
        <Route path="/ventes/clients/:id" element={<Guard ok={ctx.can('clients.view')}><ClientShow /></Guard>} />
        <Route path="/ventes/clients/:id/modifier" element={<Guard ok={ctx.can('clients.edit')}><ClientForm /></Guard>} />
        <Route path="/ventes/devis" element={<Guard ok={ctx.can('quotes.view')}><DevisList /></Guard>} />
        <Route path="/ventes/devis/nouveau" element={<Guard ok={ctx.can('quotes.create')}><SalesDocForm key="q-new" kind="quote" /></Guard>} />
        <Route path="/ventes/devis/:id" element={<Guard ok={ctx.can('quotes.view')}><DevisShow /></Guard>} />
        <Route path="/ventes/devis/:id/modifier" element={<Guard ok={ctx.can('quotes.edit')}><SalesDocForm key="q-edit" kind="quote" /></Guard>} />
        <Route path="/ventes/commandes" element={<Guard ok={ctx.can('orders.view')}><CommandesList /></Guard>} />
        <Route path="/ventes/commandes/nouvelle" element={<Guard ok={ctx.can('orders.create')}><SalesDocForm key="o-new" kind="order" /></Guard>} />
        <Route path="/ventes/commandes/:id" element={<Guard ok={ctx.can('orders.view')}><CommandeClientShow /></Guard>} />
        <Route path="/ventes/commandes/:id/modifier" element={<Guard ok={ctx.can('orders.edit')}><SalesDocForm key="o-edit" kind="order" /></Guard>} />
        <Route path="/ventes/livraisons" element={<Guard ok={ctx.can('deliveries.view')}><LivraisonsList /></Guard>} />
        <Route path="/ventes/livraisons/nouveau" element={<Guard ok={ctx.can('deliveries.create')}><LivraisonForm /></Guard>} />
        <Route path="/ventes/livraisons/:id" element={<Guard ok={ctx.can('deliveries.view')}><LivraisonShow /></Guard>} />
        <Route path="/ventes/livraisons/:id/modifier" element={<Guard ok={ctx.can('deliveries.edit')}><LivraisonForm /></Guard>} />
        <Route path="/ventes/factures" element={<Guard ok={ctx.can('invoices.view')}><FacturesList /></Guard>} />
        <Route path="/ventes/factures/:id" element={<Guard ok={ctx.can('invoices.view')}><FactureShow /></Guard>} />
        <Route path="/tresorerie/caisse" element={<Guard ok={ctx.can('payments.view')}><Caisse /></Guard>} />
        <Route path="/tresorerie/encaissements" element={<Guard ok={ctx.can('payments.view')}><Encaissements /></Guard>} />
        <Route path="/tresorerie/sessions" element={<Guard ok={ctx.can('payments.view')}><Sessions /></Guard>} />
        <Route path="/parametres/societe" element={<Guard ok={ctx.can('company.view')}><Societe /></Guard>} />
        <Route path="/parametres/depots" element={<Guard ok={ctx.can('stocks.view')}><Depots /></Guard>} />
        <Route path="/parametres/roles" element={<Guard ok={ctx.can('roles.manage')}><RoleList /></Guard>} />
        <Route path="/parametres/roles/:code" element={<Guard ok={ctx.can('roles.manage')}><RoleShow /></Guard>} />
        <Route path="/parametres/roles/:code/permissions" element={<Guard ok={ctx.can('roles.manage')}><RoleEdit /></Guard>} />
        {pages.map((p) => (
          <Route key={p.path} path={p.path} element={<Placeholder title={p.label} />} />
        ))}
        <Route path="/direction" element={<Placeholder title="Vue Direction" />} />
        <Route path="*" element={<Placeholder title="Page introuvable" />} />
      </Route>
    </Routes>
  )
}

// Bloque l'accès à un écran si l'utilisateur n'a pas la permission
function Guard({ ok, children }: { ok: boolean; children: JSX.Element }) {
  if (ok) return children
  return (
    <div className="bg-white rounded-[4px] border border-gray-300 p-5 text-sm text-gray-600">
      Vous n'avez pas accès à cet écran. Demandez à un administrateur de vous donner la permission.
    </div>
  )
}
