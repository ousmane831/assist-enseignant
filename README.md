# Assistant Enseignant — MVP pour test terrain

Outil d'aide à l'enseignant du primaire (préparation des fiches, évaluations, résultats, bulletins).
**L'outil aide l'enseignant, il ne remplace pas son jugement** : toute appréciation automatique n'est qu'une *proposition*.

## 0. Démarrage rapide (depuis la **racine** du projet)
```powershell
npm run dev:all        # backend (8000) + frontend (5173) dans deux fenêtres
npm run dev            # frontend au premier plan → http://localhost:5173
npm run backend        # backend seul   → http://localhost:8000
npm run stop           # arrête ce qui écoute sur 5173 et 8000
npm run build          # build de production du frontend
npm test               # tests de la couche hors connexion (frontend, node:test)
npm run test:backend   # vérifications + tests Django
```
Rien à installer à la racine : ces scripts délèguent au dossier `frontend/` (React + Vite) et à `demarrer.ps1`
(serveur Django, qui détecte l'environnement virtuel `backend\env` et ne relance pas un serveur déjà en écoute).
Si `npm run dev` répond **« L'application tourne déjà : http://localhost:5173 »**, c'est que le serveur est déjà
lancé (autre fenêtre) : ouvrez simplement l'adresse ; pour le redémarrer vous-même, faites `npm run stop` puis `npm run dev`.


## 1. Architecture
- `backend/` — Django + Django REST Framework (authentification par token, base **PostgreSQL** configurée dans `config/settings.py` via `.env`).
  - `core/models.py` modèles · `core/views.py` API + validation · `core/calculs.py` calculs (fonctions pures) · `core/tests/` tests
- `frontend/` — React + Vite. `src/api.js` (API, cache, file hors connexion) · `src/pages.jsx` écrans · `src/BulletinDocument.jsx` rendu bulletin · `public/sw.js` Service Worker.
- Sécurité : chaque requête est filtrée par propriétaire **côté serveur** ; un enseignant ne peut ni lire, ni modifier, ni rattacher ses objets aux données d'un autre.
- `POST /api/demandes-compte/` — **seul point d'entrée public** : dépôt d'une demande de compte depuis l'écran de connexion (voir §12).

## 2. Prérequis
Python ≥ 3.10, Node ≥ 20 (tests frontend : Node ≥ 22), npm.

## 3. Installation backend
```bash
cd backend
python -m venv env && source env/bin/activate        # Windows : env\Scripts\Activate.ps1  (dossier 'env' de ce dépôt)
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
- Base **PostgreSQL** locale (variables `POSTGRES_*` de `backend/.env`) : suffisante pour un test restreint ; prévoir sauvegardes et un vrai serveur (HTTPS) pour aller plus loin. Le fichier `backend/db.sqlite3` n'est pas utilisé.
- Pas d'inscription en ligne : les comptes sont créés par l'administrateur.

## 10. Données pédagogiques PROVISOIRES — à valider
Rien n'est officiel : matières, types d'évaluation, périodes, rubriques du canevas de fiche, seuils et libellés d'appréciation, modèle de bulletin sont des **valeurs de développement modifiables dans Paramètres**. Le catalogue de leçons est vide (l'enseignant ajoute ses leçons ; import futur d'un programme validé possible via le modèle `Lecon`).
Règles de calcul provisoires (`core/calculs.py`) : note ramenée sur une base configurable (20) ; moyenne de matière pondérée par coefficient d'évaluation ; moyenne générale = moyenne simple des matières ; arrondi à 2 décimales ; ex æquo = même rang.

## 11. Prochaines étapes
Valider les règles de calcul et le modèle de bulletin avec des enseignants ; importer un programme validé ; générateur PDF ; tests de composants React et tests bout en bout (Playwright) ; PostgreSQL et déploiement HTTPS ; icônes PWA.

## 12. Demande de compte (écran de connexion)
Le bouton **« Demander un compte »** (bas de la page de connexion) ouvre un formulaire : **nom complet, numéro de téléphone,
e-mail (facultatif), région, IA (Inspection d'Académie), IEF (Inspection de l'Éducation et de la Formation),
pièce d'identité** (type + numéro).
- Envoi : `POST /api/demandes-compte/` (Django : modèle `DemandeCompte`). C'est le **seul accès ouvert sans compte** :
  `AllowAny`, **POST uniquement** (la lecture renvoie 405 pour ne pas exposer les pièces d'identité), 30 requêtes/minute
  par adresse IP (limitation DRF existante), Internet requis.
- Le serveur **normalise** le numéro en `+221XXXXXXXXX` (variantes `77 123 45 67`, `+221 77 123 45 67`,
  `00221-77-123-45-67` acceptées), refuse une **seconde demande en attente** pour le même numéro et impose `statut`
  (`nouvelle`/`traitée`/`rejetée`) et la date : le client ne peut pas les falsifier.
- **Aucun compte n'est créé automatiquement.** L'administrateur consulte les demandes dans `/admin/`
  (filtres statut/région/pièce, recherche, actions « Marquer comme traitée / rejetée »), vérifie la pièce d'identité
  déclarée, puis crée le compte à la main (`createsuperuser` ou `/admin/`).
- Aucune donnée d'élève n'est demandée ni stockée dans cette table.
- Valeurs de référence à confirmer avec les utilisateurs : les **14 régions**, les intitulés d'**IA** (académies régionales,
  proposées en suggestion dans le formulaire) et le libellé d'**IEF** (saisie libre : chaque département a la sienne).

## 13. En cas d'échec de connexion (diagnostic)
Le message de l'écran de connexion distingue désormais les causes (`msgConnexion` dans `frontend/src/pages.jsx`) :

| Message affiché | Cause réelle | Action |
|---|---|---|
| ❌ Identifiant ou mot de passe incorrect | identifiants refusés par le serveur (400/401) | vérifier la casse et le clavier ; réinitialiser le mot de passe (voir ci-dessous) |
| 🟠 Serveur injoignable… | API arrêtée (port 8000) **ou** origine refusée par CORS | démarrer le backend (`npm run backend`) et ouvrir l'application sur **http://localhost:5173** |
| ⏳ Trop de tentatives… | limitation DRF : 30 requêtes/minute par IP | patienter une minute, puis réessayer |
| ❌ Connexion impossible (erreur 5xx) | erreur côté serveur | regarder la console où tourne `runserver` |

Vérifier un compte (actif ? mot de passe utilisable ? hasher supporté ?) :
```powershell
cd backend
env\Scripts\python.exe manage.py shell -c "from django.contrib.auth import get_user_model as G; [print(u.username, u.is_active, u.has_usable_password(), u.password.split('$')[0]) for u in G().objects.all()]"
env\Scripts\python.exe manage.py changepassword samb     # réinitialiser un mot de passe
```

Deux pièges évités par la configuration actuelle :
- **Port du frontend fixé** (`vite.config.js`, `server.strictPort`) : sans cela Vite glissait silencieusement sur 5174,
  port non autorisé par CORS → *toutes* les requêtes échouaient (dont la connexion, avec un message trompeur).
  Origines autorisées : `localhost` et `127.0.0.1`, ports 5173 et 5174 (`backend/.env`).
- **`backend/.env` est lu au démarrage** : le rechargement automatique de `runserver` ne relit pas ce fichier
  (l'environnement du processus parent est hérité). Toute modification de `.env` exige un **redémarrage complet** du backend.

## 14. Page d'administration des demandes de compte
Un compte **administrateur** (`is_staff`) voit dans l'application une entrée de menu **« Demandes »** (`/demandes`) :
liste filtrable (statut, région, recherche par nom/téléphone/IA/IEF/n° de pièce), détail de chaque demande
(informations déclarées, pièce d'identité), note de suivi, marquage **traitée / rejetée**, suppression, et
**création du compte** en un clic : identifiant proposé automatiquement à partir du nom (`aissatou.diop`, rendu unique)
et **mot de passe temporaire affiché une seule fois, jamais enregistré ni journalisé**.

Sécurité — assurée **côté serveur**, jamais seulement en masquant l'interface :
| Contrôle | Réponse |
|---|---|
| `GET/PATCH/DELETE /api/admin/demandes-compte/…` sans connexion | **401** |
| idem avec un compte enseignant (non administrateur) | **403** (aucune donnée renvoyée) |
| `POST /api/admin/demandes-compte/` (route de gestion) | **405** : on ne crée pas une demande ici |
| Informations déclarées (nom, téléphone, e-mail, région, IA, IEF, pièce) | **en lecture seule** : une demande est une preuve, elle ne se réécrit pas |
| Suivi du traitement | `traite_le` + `traite_par` imposés par le serveur ; `compte_cree` mémorise l'identifiant créé (jamais le mot de passe) |
| Menu et écran `/demandes` | affichés seulement si `est_admin` (renvoyé par `GET /api/me/`) ; ce n'est qu'un confort d'usage |

Créer un administrateur : `python manage.py createsuperuser`, ou cocher « Statut équipe » pour un compte existant dans `/admin/`.
Les administrateurs peuvent aussi continuer à traiter les demandes dans `/admin/` (mêmes données, mêmes actions).



