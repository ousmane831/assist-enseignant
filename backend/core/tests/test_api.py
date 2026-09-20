from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase
from core import models as m

U = get_user_model()
P = "1er trimestre"
Q = "?periode=1er+trimestre"


class Base(APITestCase):
    def setUp(self):
        self.a = U.objects.create_user("a", password="mdp-test-A1")
        self.b = U.objects.create_user("b", password="mdp-test-B1")
        self.cl = m.Classe.objects.create(user=self.a, niveau="CE2", nom="A", annee_scolaire="2025/2026")
        self.e1, self.e2, self.e3 = [m.Eleve.objects.create(classe=self.cl, prenom="Élève", nom=str(i)) for i in (1, 2, 3)]
        self.client.force_authenticate(self.a)

    def ev(self, **kw):
        d = dict(classe=self.cl, matiere="Français", type="Devoir", periode=P, titre="Test", note_max=20, coefficient=1)
        return m.Evaluation.objects.create(**{**d, **kw})

    def notes(self, ev, vals):  # vals : {eleve: valeur}
        return self.client.put(f"/api/evaluations/{ev.id}/notes/", [{"eleve": e.id, "valeur": v} for e, v in vals.items()], format="json")

    def url(self, action): return f"/api/classes/{self.cl.id}/{action}/{Q}"

    def res(self):
        return {r["eleve"]: r for r in self.client.get(self.url("resultats")).json()}


class Authentification(Base):
    def test_connexion_valide(self):
        self.client.force_authenticate(None)
        r = self.client.post("/api/login/", {"username": "a", "password": "mdp-test-A1"}, format="json")
        self.assertEqual(r.status_code, 200); self.assertIn("token", r.json())

    def test_connexion_invalide(self):
        self.client.force_authenticate(None)
        r = self.client.post("/api/login/", {"username": "a", "password": "faux"}, format="json")
        self.assertEqual(r.status_code, 400); self.assertNotIn("token", r.json())

    def test_acces_non_authentifie(self):
        self.client.force_authenticate(None)
        for url in ("/api/classes/", "/api/eleves/", "/api/fiches/", "/api/evaluations/", "/api/me/", "/api/parametres/"):
            self.assertEqual(self.client.get(url).status_code, 401, url)


class Permissions(Base):
    def setUp(self):
        super().setUp()
        self.ev1 = self.ev()
        self.fiche = m.Fiche.objects.create(user=self.a, niveau="CE2", matiere="Français", lecon="Le verbe", sections=[])
        self.exo = m.Exercice.objects.create(fiche=self.fiche, titre="Ex")
        self.client.force_authenticate(self.b)

    def test_listes_vides(self):
        for url in ("classes", "eleves", "fiches", "evaluations", "exercices"):
            self.assertEqual(self.client.get(f"/api/{url}/").json(), [], url)

    def test_detail_modification_suppression_refuses(self):
        for url in (f"classes/{self.cl.id}", f"eleves/{self.e1.id}", f"fiches/{self.fiche.id}", f"evaluations/{self.ev1.id}", f"exercices/{self.exo.id}"):
            self.assertEqual(self.client.get(f"/api/{url}/").status_code, 404, url)
            self.assertEqual(self.client.patch(f"/api/{url}/", {"titre": "x"}, format="json").status_code, 404, url)
            self.assertEqual(self.client.delete(f"/api/{url}/").status_code, 404, url)
        self.assertTrue(m.Classe.objects.filter(id=self.cl.id).exists())

    def test_actions_refusees(self):
        for url in (f"evaluations/{self.ev1.id}/notes/", f"evaluations/{self.ev1.id}/resultats/", f"classes/{self.cl.id}/resultats/",
                    f"classes/{self.cl.id}/bulletins/", f"classes/{self.cl.id}/verification/", f"fiches/{self.fiche.id}/restaurer/"):
            self.assertEqual(self.client.get(f"/api/{url}{Q}").status_code if "restaurer" not in url else self.client.post(f"/api/{url}").status_code, 404, url)
        self.assertEqual(self.notes(self.ev1, {self.e1: 10}).status_code, 404)
        self.assertEqual(self.client.post(f"/api/classes/{self.cl.id}/valider/{Q}").status_code, 404)

    def test_creation_dans_classe_d_autrui_refusee(self):
        r = self.client.post("/api/eleves/", {"classe": self.cl.id, "prenom": "X", "nom": "Y"}, format="json")
        self.assertIn(r.status_code, (400, 403, 404)); self.assertEqual(m.Eleve.objects.count(), 3)
        r = self.client.post("/api/evaluations/", {"classe": self.cl.id, "matiere": "Français", "type": "Devoir", "periode": P, "titre": "X"}, format="json")
        self.assertIn(r.status_code, (400, 403, 404)); self.assertEqual(m.Evaluation.objects.count(), 1)
        r = self.client.post("/api/exercices/", {"fiche": self.fiche.id, "titre": "X"}, format="json")
        self.assertIn(r.status_code, (400, 403, 404)); self.assertEqual(m.Exercice.objects.count(), 1)

    def test_rattachement_a_autrui_par_modification_refuse(self):
        cb = m.Classe.objects.create(user=self.b, niveau="CM1", nom="B")
        eb = m.Eleve.objects.create(classe=cb, prenom="B", nom="1")
        r = self.client.patch(f"/api/eleves/{eb.id}/", {"classe": self.cl.id}, format="json")
        self.assertIn(r.status_code, (400, 403, 404)); eb.refresh_from_db(); self.assertEqual(eb.classe_id, cb.id)

    def test_filtre_id_d_autrui(self):
        self.assertEqual(self.client.get(f"/api/eleves/?classe={self.cl.id}").json(), [])
        self.assertEqual(self.client.get("/api/eleves/?classe=abc").status_code, 400)

    def test_parametres_separes(self):
        self.client.put("/api/parametres/", {"annee_scolaire": "2030/2031"}, format="json")
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.get("/api/parametres/").json()["annee_scolaire"], "")


class Classes(Base):
    def test_crud(self):
        r = self.client.post("/api/classes/", {"niveau": "CM1", "nom": "B", "annee_scolaire": "2025/2026"}, format="json")
        self.assertEqual(r.status_code, 201); cid = r.json()["id"]
        self.assertEqual(m.Classe.objects.get(id=cid).user, self.a)
        self.assertEqual(self.client.get(f"/api/classes/{cid}/").json()["nom"], "B")
        self.assertEqual(self.client.patch(f"/api/classes/{cid}/", {"nom": "C"}, format="json").json()["nom"], "C")
        self.assertEqual(self.client.delete(f"/api/classes/{cid}/").status_code, 204)
        self.assertFalse(m.Classe.objects.filter(id=cid).exists())

    def test_niveau_invalide(self):
        self.assertEqual(self.client.post("/api/classes/", {"niveau": "CM3", "nom": "A"}, format="json").status_code, 400)


class Eleves(Base):
    def test_creation_consultation_modification(self):
        r = self.client.post("/api/eleves/", {"classe": self.cl.id, "prenom": "Élève", "nom": "4"}, format="json")
        self.assertEqual(r.status_code, 201); eid = r.json()["id"]
        self.assertEqual(len(self.client.get(f"/api/eleves/?classe={self.cl.id}").json()), 4)
        self.assertEqual(self.client.patch(f"/api/eleves/{eid}/", {"nom": "44"}, format="json").json()["nom"], "44")


class Notes(Base):
    def test_note_valide_decimale_et_manquante(self):
        ev = self.ev()
        self.assertEqual(self.notes(ev, {self.e1: 15, self.e2: "12,5", self.e3: ""}).status_code, 200)
        v = {n.eleve_id: n.valeur for n in ev.notes.all()}
        self.assertEqual((float(v[self.e1.id]), float(v[self.e2.id]), v[self.e3.id]), (15.0, 12.5, None))

    def test_notes_invalides_refusees_sans_rien_enregistrer(self):
        ev = self.ev()
        for bad in ("abc", 21, -1):
            r = self.notes(ev, {self.e1: 10, self.e2: bad})
            self.assertEqual(r.status_code, 400, bad)
            self.assertEqual(ev.notes.count(), 0, "tout ou rien")

    def test_eleve_d_une_autre_classe_refuse(self):
        autre = m.Eleve.objects.create(classe=m.Classe.objects.create(user=self.a, niveau="CM1", nom="X"), prenom="Z", nom="9")
        self.assertEqual(self.notes(self.ev(), {autre: 10}).status_code, 400)

    def test_note_max_reduite_sous_une_note_refusee(self):
        ev = self.ev(); self.notes(ev, {self.e1: 18})
        self.assertEqual(self.client.patch(f"/api/evaluations/{ev.id}/", {"note_max": 10}, format="json").status_code, 400)


class Calculs(Base):
    def test_moyenne_coefficient_et_generale(self):
        self.notes(self.ev(titre="A"), {self.e1: 10})
        e2 = self.ev(titre="B", note_max=10, coefficient=2); self.notes(e2, {self.e1: 8})
        r = self.res()[self.e1.id]
        self.assertEqual(r["matieres"]["Français"], 14.0); self.assertEqual(r["moyenne"], 14.0)

    def test_plusieurs_matieres(self):
        self.notes(self.ev(), {self.e1: 10}); self.notes(self.ev(matiere="Mathématiques"), {self.e1: 16})
        self.assertEqual(self.res()[self.e1.id]["moyenne"], 13.0)

    def test_classement_egalite_et_sans_note(self):
        self.notes(self.ev(), {self.e1: 12, self.e2: 12})
        r = self.res()
        self.assertEqual((r[self.e1.id]["rang"], r[self.e2.id]["rang"]), (1, 1))
        self.assertIsNone(r[self.e3.id]["moyenne"]); self.assertNotIn("rang", r[self.e3.id])

    def test_classement_desactivable(self):
        self.client.put("/api/parametres/", {"classement": False}, format="json")
        self.notes(self.ev(), {self.e1: 12})
        self.assertNotIn("rang", self.res()[self.e1.id])

    def test_resultats_evaluation(self):
        ev = self.ev(); self.notes(ev, {self.e1: 10, self.e2: 20})
        d = self.client.get(f"/api/evaluations/{ev.id}/resultats/").json()
        self.assertEqual((d["moyenne"], d["meilleure"], d["minimale"], d["saisies"], d["effectif"]), (15.0, 20.0, 10.0, 2, 3))

    def test_parametres_invalides(self):
        self.assertEqual(self.client.put("/api/parametres/", {"base_moyenne": 0}, format="json").status_code, 400)
        self.assertEqual(self.client.put("/api/parametres/", {"matieres": []}, format="json").status_code, 400)


class Evaluations(Base):
    def test_creation_modification(self):
        d = {"classe": self.cl.id, "matiere": "Français", "type": "Devoir", "periode": P, "titre": "T", "note_max": 20, "coefficient": 1, "statut": "valide"}
        r = self.client.post("/api/evaluations/", d, format="json")
        self.assertEqual(r.status_code, 201); self.assertEqual(r.json()["statut"], "brouillon", "statut non modifiable directement")
        eid = r.json()["id"]
        self.assertEqual(self.client.patch(f"/api/evaluations/{eid}/", {"titre": "T2", "statut": "valide"}, format="json").json()["statut"], "brouillon")

    def test_note_max_et_coefficient_invalides(self):
        d = {"classe": self.cl.id, "matiere": "Français", "type": "Devoir", "periode": P, "titre": "T"}
        self.assertEqual(self.client.post("/api/evaluations/", {**d, "note_max": 0}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/evaluations/", {**d, "coefficient": -1}, format="json").status_code, 400)


class Validation(Base):
    def test_cycle_complet(self):
        ev = self.ev(); self.notes(ev, {self.e1: 12, self.e2: 14, self.e3: 9})
        self.assertEqual(self.client.post(self.url("valider"), {"confirmer": True}, format="json").status_code, 409, "pas de validation sans vérification")
        self.assertEqual(self.client.get(self.url("bulletins")).status_code, 409)
        self.assertEqual(self.client.post(self.url("verifier")).status_code, 200)
        ev.refresh_from_db(); self.assertEqual(ev.statut, "verifie")
        self.notes(ev, {self.e1: 13})
        ev.refresh_from_db(); self.assertEqual(ev.statut, "brouillon", "modifier annule la vérification")
        self.client.post(self.url("verifier"))
        r = self.client.post(self.url("valider"), {}, format="json")
        self.assertEqual(r.status_code, 409); self.assertTrue(r.json()["confirmation_requise"])
        r = self.client.post(self.url("valider"), {"confirmer": True}, format="json")
        self.assertEqual(r.status_code, 200); self.assertEqual(r.json()["statut"], "valide")
        ev.refresh_from_db(); self.assertEqual(ev.statut, "valide"); self.assertIsNotNone(ev.valide_le)
        self.assertEqual(self.notes(ev, {self.e1: 5}).status_code, 409)
        self.assertEqual(self.client.patch(f"/api/evaluations/{ev.id}/", {"titre": "x"}, format="json").status_code, 409)
        self.assertEqual(self.client.delete(f"/api/evaluations/{ev.id}/").status_code, 409)
        d = {"classe": self.cl.id, "matiere": "Français", "type": "Devoir", "periode": P, "titre": "Autre"}
        self.assertEqual(self.client.post("/api/evaluations/", d, format="json").status_code, 409)
        self.assertEqual(self.client.put(self.url("appreciations"), [{"eleve": self.e1.id, "texte": "x"}], format="json").status_code, 409)
        b = self.client.get(self.url("bulletins")).json()
        self.assertEqual((b["classe"]["nom"], b["periode"], len(b["eleves"])), ("A", P, 3))
        self.assertEqual(b["eleves"][0]["evaluations"]["Français"][0]["note_max"], 20.0)
        self.assertEqual(self.client.post(self.url("rouvrir")).status_code, 200)
        ev.refresh_from_db(); self.assertEqual(ev.statut, "brouillon")
        self.assertEqual(self.notes(ev, {self.e1: 5}).status_code, 200)
        self.assertEqual(self.client.get(self.url("bulletins")).status_code, 409)

    def test_verifier_sans_evaluation(self):
        self.assertEqual(self.client.post(self.url("verifier")).status_code, 400)


class Appreciations(Base):
    def test_proposition_modification_validation(self):
        ev = self.ev(); self.notes(ev, {self.e1: 18, self.e2: 6})
        p = self.client.get(self.url("proposer")).json()
        self.assertEqual(set(p), {str(self.e1.id), str(self.e2.id)}); self.assertFalse(any(x["validee"] for x in p.values()))
        self.assertEqual(m.Appreciation.objects.count(), 0, "une proposition n'est pas enregistrée")
        put = lambda **kw: self.client.put(self.url("appreciations"), [{"eleve": self.e1.id, **kw}], format="json")
        self.assertEqual(put(texte="Bon travail", validee=False).status_code, 200)
        self.assertFalse(m.Appreciation.objects.get(eleve=self.e1).validee)
        put(texte="Bon travail", validee=True); self.assertTrue(m.Appreciation.objects.get(eleve=self.e1).validee)
        put(texte="Bon travail, à poursuivre", validee=False); self.assertFalse(m.Appreciation.objects.get(eleve=self.e1).validee)
        put(texte="", validee=True); a = m.Appreciation.objects.get(eleve=self.e1)
        self.assertEqual((a.texte, a.validee), ("", False), "suppression possible ; jamais validée sans texte")

    def test_appreciation_non_validee_absente_du_bulletin(self):
        ev = self.ev(); self.notes(ev, {self.e1: 12})
        self.client.put(self.url("appreciations"), [{"eleve": self.e1.id, "texte": "Brouillon", "validee": False}], format="json")
        self.client.post(self.url("verifier")); self.client.post(self.url("valider"), {"confirmer": True}, format="json")
        self.assertEqual(self.client.get(self.url("bulletins")).json()["eleves"][0]["appreciation"], "")


class Fiches(Base):
    def creer(self):
        r = self.client.post("/api/fiches/", {"niveau": "CE2", "matiere": "Français", "lecon": "Le verbe", "annee_scolaire": "2025/2026",
                                              "sections": [{"titre": "Objectifs", "contenu": "v1"}]}, format="json")
        self.assertEqual(r.status_code, 201); return r.json()["id"]

    def test_creation_modification_restauration(self):
        fid = self.creer()
        self.client.patch(f"/api/fiches/{fid}/", {"lecon": "Le verbe (2)"}, format="json")
        self.assertIsNone(self.client.get(f"/api/fiches/{fid}/").json()["version_precedente"], "modif hors sections : pas de version")
        self.client.patch(f"/api/fiches/{fid}/", {"sections": [{"titre": "Objectifs", "contenu": "v2"}]}, format="json")
        f = self.client.get(f"/api/fiches/{fid}/").json()
        self.assertEqual((f["sections"][0]["contenu"], f["version_precedente"][0]["contenu"]), ("v2", "v1"))
        r = self.client.post(f"/api/fiches/{fid}/restaurer/").json()
        self.assertEqual(r["sections"][0]["contenu"], "v1")

    def test_duplication(self):
        fid = self.creer(); m.Exercice.objects.create(fiche_id=fid, titre="Ex 1")
        r = self.client.post(f"/api/fiches/{fid}/dupliquer/", {"annee_scolaire": "2026/2027"}, format="json")
        self.assertEqual(r.status_code, 201); n = r.json()
        self.assertNotEqual(n["id"], fid); self.assertEqual(n["annee_scolaire"], "2026/2027")
        self.assertEqual(len(n["exercices"]), 1); self.assertEqual(m.Exercice.objects.count(), 2)
        self.assertEqual(m.Fiche.objects.get(id=fid).annee_scolaire, "2025/2026")

    def test_recherche_et_filtres(self):
        self.creer()
        self.assertEqual(len(self.client.get("/api/fiches/?niveau=CE2&lecon__icontains=verb").json()), 1)
        self.assertEqual(len(self.client.get("/api/fiches/?niveau=CM1").json()), 0)


class Exercices(Base):
    def test_creation_modification_suppression(self):
        f = m.Fiche.objects.create(user=self.a, niveau="CE2", matiere="Français", lecon="L")
        r = self.client.post("/api/exercices/", {"fiche": f.id, "titre": "Identifier le verbe", "ordre": 0}, format="json")
        self.assertEqual(r.status_code, 201); xid = r.json()["id"]
        self.assertEqual(self.client.get(f"/api/fiches/{f.id}/").json()["exercices"][0]["titre"], "Identifier le verbe")
        r = self.client.patch(f"/api/exercices/{xid}/", {"titre": "Conjuguer", "imprimer": False, "ordre": 3}, format="json").json()
        self.assertEqual((r["titre"], r["imprimer"], r["ordre"]), ("Conjuguer", False, 3))
        self.assertEqual(self.client.delete(f"/api/exercices/{xid}/").status_code, 204)
        self.assertEqual(m.Exercice.objects.count(), 0)
