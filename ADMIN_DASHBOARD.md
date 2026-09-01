# Dashboard administrateur NutriTracker

Le dashboard est disponible à l’adresse `/admin.html` après déploiement.

## Activation

1. Ouvrir l’éditeur SQL du projet Supabase NutriTracker.
2. Exécuter le fichier `supabase/admin-analytics.sql`.
3. Dans Netlify, ajouter les variables d’environnement :
   - `ADMIN_EMAIL` : l’adresse email du compte Supabase autorisé à ouvrir le dashboard.
   - `ANALYTICS_SALT` : une chaîne aléatoire longue utilisée pour anonymiser les adresses IP.
4. Vérifier que `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont déjà configurées.
5. Redéployer le site.

## Données affichées

- visites et visiteurs uniques ;
- inscriptions et taux de conversion ;
- utilisateurs et abonnements actifs ;
- sources de trafic et localisation ;
- éléments les plus cliqués et carte des clics ;
- dernières inscriptions et dernière connexion.

Les adresses IP ne sont jamais stockées en clair. Le navigateur envoie uniquement les événements `page_view` et `click`; aucune donnée nutritionnelle personnelle n’est collectée par ce module.
