# Plan de reconstruction — v1

Base : cartographie de l'A3 ERP actuel (10/11/2026).
Principe : garder le cœur réellement utilisé, un écran par besoin, des formulaires courts.

## Périmètre v1 (hypothèse à valider)

| Module | Écrans v1 | Repris de l'ERP actuel |
| --- | --- | --- |
| Paramètres | Société, utilisateurs + rôles, référentiels (unités, catégories, TVA, modes de règlement, dépôts) | /parametrage, /users, /roles, référentiels |
| Ventes | Devis, commandes, livraisons (BL), factures, clients | Circuit devis → commande → BL → facture |
| Caisse | Encaissements (avec imputation sur facture), sessions d'ouverture / clôture | /tresorerie/caisse, encaissements, clôtures |
| Stock | Articles, niveaux + mouvements | /products, /stocks, /stocks/mouvements |
| Achats | Fournisseurs, commandes fournisseur avec réception | BC → réception (crée la bobine) |
| Production | OF (MTO), bobines, déclaration de production | OF, allocation, suivi, visa |

Reportés après la v1 : comptabilité générale (écritures, lettrage, états), CRM, RH / paie, contrats,
RFQ, effets, budgets, immobilisations, maintenance, optimisation de découpe, rapports avancés.

## Règles métier à conserver

- Commande validée seulement si l'article a une stratégie (MTO / MTS) et le dépôt autorise la vente.
- MTO : la production démarre après paiement (acompte paramétrable).
- Bobine allouable uniquement si elle vient d'une réception.
- Validation du BL : sortie de stock + création de la facture en brouillon.
- Facture validée = verrouillée ; correction par avoir.
- Encaissement non imputé = avance, imputable ensuite sur une facture.

## Simplifications prévues

- Une seule entrée pour encaisser (la caisse), une seule pour ouvrir / clôturer une caisse.
- Les réglages (comptes, unités, stocks mini) portés par la catégorie ; l'article n'a que ses champs propres.
- Bobine = lot de matière : une seule notion.
- Machine + ligne + centre de travail fusionnés en « ligne de production ».
- Un seul tableau de bord par profil.
