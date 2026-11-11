# ERP OA Metal (version simplifiée)

Reconstruction simplifiée de l'A3 ERP d'OA METAL INDUSTRIE.
Frontend : Vite + React + TypeScript. Base de données et authentification : Supabase. Hébergement : Vercel.

## Démarrer en local

1. Installer les dépendances : `npm install`
2. Copier `.env.example` en `.env.local` et y mettre l'URL et la clé « anon » du projet Supabase.
3. Lancer : `npm run dev`, puis ouvrir http://localhost:5173

## Structure

```
src/
  lib/supabase.ts      client Supabase
  lib/menu.ts          menu de la v1 (modules et écrans)
  components/Layout.tsx  menu latéral + barre du haut
  pages/               écrans (Login, Tableau de bord, écrans à construire)
supabase/migrations/   scripts SQL des tables (étape suivante)
docs/PLAN.md           périmètre et étapes de la reconstruction
```

## Étapes

1. Dossier et squelette React — fait
2. Tables Supabase (migrations SQL)
3. Dépôt Git (GitHub)
4. Déploiement Vercel (variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY)
5. Écrans module par module
