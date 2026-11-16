"""Référentiel pédagogique (guides transcrits) et génération automatique de fiches."""
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from core import models as m
from core import referentiel as R

U = get_user_model()
SEANCE = "e1-co-p1-oa1-s1"  # CI · Communication orale · Palier 1 · Saluer une personne (guide étape 1, p. 32)


class Donnees(SimpleTestCase):
    """Intégrité des fichiers du référentiel (sans PDF ; la fidélité au PDF : manage.py verifier_referentiel)."""

    def test_structure_valide(self):
        self.assertTrue(R.guides(), "aucun guide transcrit")
        for g in R.guides():
            self.assertEqual(R.valider_structure(g), [], g["guide"]["id"])

    def test_identifiants_uniques_entre_guides(self):
        ids = [s["id"] for *_, s in R.parcourir()]
        self.assertEqual(len(ids), len(set(ids)))

    def test_contenus_herites_de_l_oa_ou_du_palier(self):
        g, a, p, oa, s = R.trouver_seance("e1-co-p7-oa1-s2")  # cellule « contenus » fusionnée dans le guide
        self.assertEqual(s["contenus"], "")
        self.assertIn("Connecteurs temporels", R.contenus_effectifs(p, oa, s))

    def test_controle_de_fidelite_detecte_une_invention(self):
        import copy
        def textes(x):  # toutes les chaînes d'une structure, quelle qu'en soit la profondeur
            if isinstance(x, str): return [x]
            if isinstance(x, dict): return [t for v in x.values() for t in textes(v)]
            if isinstance(x, list): return [t for v in x for t in textes(v)]
            return []

        g = copy.deepcopy(R.guides()[0])
        pages = {n: "" for n in range(1, 400)}
        for a in g["activites"]:  # « PDF » fabriqué à partir de la transcription elle-même…
            pages[a["pages"][0]] += " ".join(textes({k: v for k, v in a.items() if k != "paliers"}))
            for p in a["paliers"]:
                pages[p["pages"][0]] += " " + " ".join(textes(p))
        self.assertEqual(R.verifier_fidelite(g, pages), [])
        g["activites"][0]["paliers"][0]["oa"][0]["seances"][0]["contenus"] += " phrase inventée"  # …puis une invention
        (ecart,) = R.verifier_fidelite(g, pages)
        self.assertEqual(ecart[2], ["inventee", "phrase"])


class Api(APITestCase):
    def setUp(self):
        self.u = U.objects.create_user("ens", password="mdp-test-E1")
        self.client.force_authenticate(self.u)

    def test_sommaire(self):
        d = self.client.get("/api/referentiel-pedagogique/").json()
        self.assertIn("CI", d["niveaux"])
        co = next(a for a in d["activites"] if a["id"] == "e1-co")
        self.assertEqual((co["matiere"], co["niveaux"]), ("Français", ["CI", "CP"]))

    def test_filtre_par_niveau(self):
        d = self.client.get("/api/referentiel-pedagogique/?niveau=CP").json()
        paliers = [p for a in d["activites"] for p in a["paliers"]]
        self.assertTrue(paliers and all(p["niveau"] == "CP" for p in paliers))
        self.assertEqual(self.client.get("/api/referentiel-pedagogique/?niveau=CM9").status_code, 400)
        self.assertEqual(self.client.get("/api/referentiel-pedagogique/?niveau=CM2").json()["activites"], [])

    def test_lecture_seule_et_authentification(self):
        self.assertEqual(self.client.post("/api/referentiel-pedagogique/", {}, format="json").status_code, 405)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/referentiel-pedagogique/").status_code, 401)

    def test_generation_d_une_fiche(self):
        r = self.client.post("/api/fiches/generer/", {"seance": SEANCE, "annee_scolaire": "2026/2027"}, format="json")
        self.assertEqual(r.status_code, 201)
        f = r.json()
        self.assertEqual((f["niveau"], f["matiere"], f["domaine"], f["annee_scolaire"]), ("CI", "Français", "Communication orale", "2026/2027"))
        self.assertEqual(f["lecon"], "Saluer une personne/ réagir à une salutation (séance 1/2)")
        self.assertEqual(f["origine"], {"guide": "etape1", "activite": "e1-co", "seance": SEANCE, "pages": [32, 33]})
        sections = {x["titre"]: x["contenu"] for x in f["sections"]}
        self.assertIn("Bonjour Farma", sections["Contenus"])                       # repris du guide
        self.assertIn("Pertinence", sections["Évaluation"])                       # critères du guide
        self.assertIn("Un nouvel élève vient d’arriver", sections["Évaluation"])  # situation d'intégration du palier
        self.assertTrue(sections["Déroulement"].startswith("Canevas proposé par l'application"))  # annoncé comme tel
        self.assertIn("p. 32-33", sections["Source"])

    def test_fiche_generee_modifiable_et_independante(self):
        f = self.client.post("/api/fiches/generer/", {"seance": SEANCE}, format="json").json()
        r = self.client.patch(f"/api/fiches/{f['id']}/", {"sections": [{"titre": "Ma rubrique", "contenu": "Mon texte"}],
                                                           "origine": {"guide": "pirate"}}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()["sections"], [{"titre": "Ma rubrique", "contenu": "Mon texte"}])
        self.assertEqual(r.json()["origine"]["guide"], "etape1", "l'origine n'est pas modifiable par le client")
        g = self.client.post("/api/fiches/generer/", {"seance": SEANCE}, format="json").json()
        self.assertNotEqual(g["id"], f["id"])                                     # une nouvelle génération = une nouvelle fiche
        self.assertEqual(m.Fiche.objects.get(id=f["id"]).sections[0]["titre"], "Ma rubrique")  # l'ancienne reste intacte

    def test_annee_par_defaut_et_seance_inconnue(self):
        self.client.put("/api/parametres/", {"annee_scolaire": "2025/2026"}, format="json")
        self.assertEqual(self.client.post("/api/fiches/generer/", {"seance": SEANCE}, format="json").json()["annee_scolaire"], "2025/2026")
        self.assertEqual(self.client.post("/api/fiches/generer/", {"seance": "inconnue"}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/fiches/generer/", {}, format="json").status_code, 400)

    def test_fiche_generee_privee(self):
        f = self.client.post("/api/fiches/generer/", {"seance": SEANCE}, format="json").json()
        autre = U.objects.create_user("autre", password="mdp-test-X1")
        self.client.force_authenticate(autre)
        self.assertEqual(self.client.get(f"/api/fiches/{f['id']}/").status_code, 404)
