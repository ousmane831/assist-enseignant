# Assistant Enseignant — MVP pour test terrain

Outil d'aide à l'enseignant du primaire (préparation des fiches, évaluations, résultats, bulletins).
**L'outil aide l'enseignant, il ne remplace pas son jugement** : toute appréciation automatique n'est qu'une *proposition*.

## 1. Architecture
- `backend/` — Django + Django REST Framework (authentification par token, SQLite en développement).
  - `core/models.py` modèles · `core/views.py` API + validation · `core/calculs.py` calculs (fonctions pures) · `core/tests/` tests
- `frontend/` — React + Vite. `src/api.js` (API, cache, file hors connexion) · `src/pages.jsx` écrans · `src/BulletinDocument.jsx` rendu bulletin · `public/sw.js` Service Worker.
- Sécurité : chaque requête est filtrée par propriétaire **côté serveur** ; un enseignant ne peut ni lire, ni modifier, ni rattacher ses objets aux données d'un autre.

## 2. Prérequis
Python ≥ 3.10, Node ≥ 20 (tests frontend : Node ≥ 22), npm.

## 3. Installation backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py makemigrations core                     # génère les migrations (nouveaux champs : Evaluation.statut, valide_le)
python manage.py migrate
python manage.py createsuperuser                         # compte enseignant (ou via /admin/)
python manage.py runserver                               # http://localhost:8000
```
Données de démonstration (noms **fictifs** uniquement) : `python manage.py donnees_demo --password "<mot-de-passe>"`

## 4. Installation frontend
```bash
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:8000/api  (SEULE définition de l'URL de l'API)
npm install
npm run dev                 # http://localhost:5173
npm run build               # build de production (dist/)
```

## 5. Variables d'environnement
| Fichier | Variable | Rôle |
|---|---|---|
| backend/.env | `DEBUG` | `1` en développement ; **`0` pour un test avec de vrais enseignants** |
| backend/.env | `SECRET_KEY` | obligatoire si `DEBUG=0` |
| backend/.env | `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` | hôtes et origines du frontend autorisés |
| frontend/.env | `VITE_API_URL` | URL de l'API Django |
Ne jamais versionner `.env` (déjà dans `.gitignore`).

## 6. Tests
```bash
cd backend
python manage.py check && python manage.py makemigrations --check && python manage.py test
python -m unittest core.tests.test_calculs          # calculs seuls, sans Django
cd ../frontend && npm test                          # couche hors connexion (node:test, aucune dépendance)
```

## 7. Validation des résultats
Chaque évaluation a un statut persistant : **brouillon → vérifiée → validée**.
- Modifier des notes/appréciations d'une période *vérifiée* la ramène à *brouillon*.
- Une période *validée* est verrouillée (notes, appréciations, évaluations : erreur 409). Le bouton **« Rouvrir pour modifier »** (confirmation demandée) la remet en brouillon.
- Le bulletin/livret n'est généré que pour une période **validée**, à partir des données enregistrées (`GET /api/classes/<id>/bulletins/?periode=…`).

## 8. Fonctionnement hors connexion
- Bandeau : 🟢 En ligne · 🟠 Hors connexion · 🔄 Synchronisation · 🟢 Synchronisation terminée · ⚠️ Synchronisation impossible.
- **Notes** : chaque saisie est sauvegardée immédiatement sur l'appareil (brouillon), envoyée au serveur, et le brouillon n'est effacé qu'après confirmation du serveur. Si l'onglet est fermé, les saisies restantes sont renvoyées à la réouverture.
- Modifications de fiches/exercices/notes hors connexion : mises en **file d'attente** (par utilisateur, ordre conservé), envoyées au retour du réseau (événement `online`, au démarrage et toutes les 30 s). Rien n'est retiré de la file avant réponse définitive du serveur.
- Modification refusée (ex. résultats validés entre-temps) : conservée, signalée, avec **Réessayer / Abandonner** ; jamais supprimée silencieusement. Conflits : « dernière écriture gagnante » côté serveur.
- Les données déjà consultées en ligne restent lisibles (cache local par utilisateur ; préchargement des classes, élèves, évaluations, notes et fiches au démarrage).
- **Service Worker** (`public/sw.js`, actif uniquement en build de production) : l'application se recharge hors connexion après un premier chargement en ligne.

## 9. Limites actuelles
- Créations (nouvelle classe, fiche, exercice, évaluation, élève), connexion, vérification/validation/réouverture : **connexion requise** (évite les doublons).
- Résultats, appréciations proposées et bulletins nécessitent le serveur (calculs côté serveur) ; ils ne sont pas consultables hors connexion s'ils n'ont pas été chargés.
- PWA minimale : pas d'icônes ni d'installation « application » soignée. Le Service Worker n'est pas testé automatiquement.
- Pas de tests de composants React (vitest/testing-library non installables sans réseau dans l'environnement de développement de cet audit).
- « Télécharger PDF » = impression du navigateur (`exporterPdf` dans `BulletinDocument.jsx` : point d'extension pour un vrai générateur).
- SQLite : suffisant pour un test restreint ; prévoir PostgreSQL et un vrai serveur (HTTPS) pour davantage.
- Pas d'inscription en ligne : les comptes sont créés par l'administrateur.

## 10. Données pédagogiques PROVISOIRES — à valider
Rien n'est officiel : matières, types d'évaluation, périodes, rubriques du canevas de fiche, seuils et libellés d'appréciation, modèle de bulletin sont des **valeurs de développement modifiables dans Paramètres**. Le catalogue de leçons est vide (l'enseignant ajoute ses leçons ; import futur d'un programme validé possible via le modèle `Lecon`).
Règles de calcul provisoires (`core/calculs.py`) : note ramenée sur une base configurable (20) ; moyenne de matière pondérée par coefficient d'évaluation ; moyenne générale = moyenne simple des matières ; arrondi à 2 décimales ; ex æquo = même rang.

## 11. Prochaines étapes
Valider les règles de calcul et le modèle de bulletin avec des enseignants ; importer un programme validé ; générateur PDF ; tests de composants React et tests bout en bout (Playwright) ; PostgreSQL et déploiement HTTPS ; icônes PWA.
