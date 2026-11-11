// Menu de la v1 : même présentation que l'A3 ERP (modules dépliables,
// sous-sections), mais limité aux écrans de la v1.

export const ICONS = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  ventes: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z',
  achats: 'M3 7h11v9H3zM14 10h4l3 3v3h-7zM7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z',
  stocks: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4',
  production: 'M3 21V9l6 4V7l6 4V3h6v18H3z',
  tresorerie: 'M3 10h18M3 10a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2v-8zm0 0V7a2 2 0 012-2h11M16 14h2',
  parametres: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  doc: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  chevron: 'M19 9l-7 7-7-7',
  burger: 'M4 6h16M4 12h16M4 18h16',
}

export type MenuItem = { label: string; path: string; perm?: string }
export type MenuSection = { title: string; items: MenuItem[] }
export type MenuModule = { key: string; label: string; icon: string; sections: MenuSection[] }

export const HOME: MenuItem = { label: 'Tableau de bord', path: '/', perm: 'direction.view' }
// Écrans pas encore construits : visibles seulement par le super administrateur
const SOON = 'roadmap.soon'

export const modules: MenuModule[] = [
  {
    key: 'ventes',
    label: 'Ventes',
    icon: ICONS.ventes,
    sections: [
      { title: 'Cycle de vente', items: [
        { label: 'Devis', path: '/ventes/devis', perm: 'quotes.view' },
        { label: 'Commandes clients', path: '/ventes/commandes', perm: 'orders.view' },
      ] },
      { title: 'Logistique', items: [{ label: 'Bons de livraison', path: '/ventes/livraisons', perm: 'deliveries.view' }] },
      { title: 'Facturation', items: [
        { label: 'Factures clients', path: '/ventes/factures', perm: 'invoices.view' },
        { label: 'Avoirs clients', path: '/ventes/avoirs', perm: SOON },
      ] },
      { title: 'Tiers', items: [{ label: 'Clients', path: '/ventes/clients', perm: 'clients.view' }] },
    ],
  },
  {
    key: 'achats',
    label: 'Achats',
    icon: ICONS.achats,
    sections: [
      { title: "Cycle d'achat", items: [
        { label: 'Commandes fournisseurs', path: '/achats/commandes', perm: 'purchase_orders.view' },
        { label: 'Réceptions', path: '/achats/receptions', perm: 'receptions.view' },
      ] },
      { title: 'Tiers', items: [{ label: 'Fournisseurs', path: '/achats/fournisseurs', perm: 'suppliers.view' }] },
    ],
  },
  {
    key: 'stocks',
    label: 'Stocks',
    icon: ICONS.stocks,
    sections: [
      { title: 'Référentiel', items: [{ label: 'Articles', path: '/stocks/articles', perm: 'products.view' }] },
      { title: 'Suivi', items: [
        { label: 'Niveaux de stock', path: '/stocks/niveaux', perm: SOON },
        { label: 'Mouvements de stock', path: '/stocks/mouvements', perm: 'stocks.view' },
        { label: 'Bobines', path: '/stocks/bobines', perm: 'stocks.view' },
        { label: 'Fins de bobine', path: '/stocks/fins-bobine', perm: 'stocks.view' },
      ] },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    icon: ICONS.production,
    sections: [
      { title: 'Fabrication', items: [
        { label: 'Ordres de fabrication', path: '/production/of', perm: 'production.view' },
      ] },
      { title: 'Référentiel', items: [{ label: 'Lignes de production', path: '/production/lignes', perm: SOON }] },
    ],
  },
  {
    key: 'tresorerie',
    label: 'Trésorerie',
    icon: ICONS.tresorerie,
    sections: [
      { title: 'Caisse', items: [
        { label: 'Caisse / Encaissement client', path: '/tresorerie/caisse', perm: 'payments.view' },
        { label: 'Encaissements clients', path: '/tresorerie/encaissements', perm: 'treasury.view' },
        { label: 'Opérations de caisse', path: '/tresorerie/operations', perm: SOON },
        { label: 'Ouverture / Clôture de caisse', path: '/tresorerie/sessions', perm: 'treasury.view' },
      ] },
      { title: 'Comptes', items: [{ label: 'Caisses & banques', path: '/tresorerie/comptes', perm: SOON }] },
    ],
  },
  {
    key: 'parametres',
    label: 'Paramètres',
    icon: ICONS.parametres,
    sections: [
      { title: 'Société', items: [
        { label: 'Société', path: '/parametres/societe', perm: 'company.view' },
        { label: 'Utilisateurs', path: '/parametres/utilisateurs', perm: 'users.manage' },
        { label: 'Rôles & permissions', path: '/parametres/roles', perm: 'roles.manage' },
      ] },
      { title: 'Référentiels', items: [
        { label: 'Catégories articles', path: '/parametres/categories', perm: SOON },
        { label: 'Dépôts', path: '/parametres/depots', perm: 'settings.manage' },
        { label: 'Unités, TVA, règlements', path: '/parametres/referentiels', perm: SOON },
      ] },
    ],
  },
]

// Écrans sans entrée de menu propre (pour le fil d'Ariane)
const HIDDEN: MenuItem[] = [{ label: 'Demande de transfert', path: '/stocks/transferts' }]

export const allItems: MenuItem[] = [HOME, ...modules.flatMap((m) => m.sections.flatMap((s) => s.items))]
const labelItems: MenuItem[] = [...allItems, ...HIDDEN]

// Libellé du fil d'Ariane : l'entrée de menu la plus précise qui contient l'adresse
export function labelFor(pathname: string): string {
  const match = labelItems
    .filter((i) => (i.path === '/' ? pathname === '/' : pathname === i.path || pathname.startsWith(i.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0]
  return match?.label ?? 'Page introuvable'
}
