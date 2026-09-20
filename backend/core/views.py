from collections import defaultdict
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import routers, viewsets
from rest_framework.decorators import action, api_view
from rest_framework.exceptions import APIException, ValidationError
from rest_framework.response import Response
from . import calculs as C, models as m, serializers as s

MSG_VALIDE = "Les résultats de cette période sont validés. Rouvrez-les pour les modifier."


class Conflit(APIException):
    status_code, default_detail, default_code = 409, MSG_VALIDE, "conflict"


# Valeurs PROVISOIRES et modifiables par l'enseignant (Paramètres). Aucune n'est une règle officielle.
DEFAULTS = {
    "matieres": ["Français", "Mathématiques", "Sciences", "Histoire", "Géographie", "Éducation civique"],
    "types": ["Devoir", "Évaluation", "Composition"],
    "periodes": ["1er trimestre", "2e trimestre", "3e trimestre"],
    "canevas": ["Objectifs", "Compétences", "Prérequis", "Matériel", "Situation de départ",
                "Déroulement", "Activités", "Évaluation"],
    "classement": True, "base_moyenne": 20, "note_max_defaut": 20,
    "appreciations": [  # seuils en fraction de la base : suggestions à valider
        {"min": 0, "texte": "Besoin d'accompagnement"}, {"min": 0.4, "texte": "Résultats à surveiller"},
        {"min": 0.5, "texte": "Résultats satisfaisants"}, {"min": 0.7, "texte": "Bons résultats"}],
    "modele_bulletin": "Modèle provisoire de l'application : à remplacer par le modèle validé",
    "annee_scolaire": "",
}


def cfg(user):
    p, _ = m.Parametres.objects.get_or_create(user=user)
    return {**DEFAULTS, **p.config}


def nettoyer_config(d):
    if not isinstance(d, dict):
        raise ValidationError("Paramètres invalides.")
    out = {}
    for k in ("matieres", "types", "periodes", "canevas"):
        if k in d:
            v = d[k]
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                raise ValidationError({k: "Liste de textes attendue."})
            v = [x.strip()[:80] for x in v if x.strip()]
            if not v:
                raise ValidationError({k: "Au moins un élément est requis."})
            out[k] = v
    if "classement" in d:
        out["classement"] = bool(d["classement"])
    if "base_moyenne" in d:
        try:
            b = float(d["base_moyenne"])
        except (TypeError, ValueError):
            raise ValidationError({"base_moyenne": "Nombre attendu."})
        if not 0 < b <= 1000:
            raise ValidationError({"base_moyenne": "La base doit être comprise entre 0 et 1000."})
        out["base_moyenne"] = b
    for k in ("annee_scolaire", "modele_bulletin"):
        if k in d:
            out[k] = str(d[k])[:200]
    if "appreciations" in d:
        try:
            out["appreciations"] = sorted(({"min": float(a["min"]), "texte": str(a["texte"])[:200]} for a in d["appreciations"]), key=lambda a: a["min"])
        except (TypeError, KeyError, ValueError):
            raise ValidationError({"appreciations": "Format invalide."})
        if not out["appreciations"] or out["appreciations"][0]["min"] > 0:
            raise ValidationError({"appreciations": "Le premier seuil doit être 0."})
    return out


class Owned(viewsets.ModelViewSet):
    """Toutes les requêtes sont filtrées par propriétaire côté serveur (jamais confiance au frontend)."""
    owner, filters, parent = "user", [], None

    def get_queryset(self):
        qs = self.queryset.filter(**{self.owner: self.request.user})
        f = {k: v for k, v in self.request.query_params.items() if k in self.filters and v}
        try:
            return qs.filter(**f)
        except (ValueError, TypeError, DjangoValidationError):
            raise ValidationError("Filtre invalide.")

    def check_parent(self, ser):  # empêche de rattacher un objet à la classe/fiche d'un autre enseignant
        p = ser.validated_data.get(self.parent) if self.parent else None
        if p is not None and p.user_id != self.request.user.id:
            raise ValidationError({self.parent: "Objet introuvable."})

    def perform_create(self, ser):
        self.check_parent(ser)
        ser.save(user=self.request.user) if self.owner == "user" else ser.save()

    def perform_update(self, ser):
        self.check_parent(ser)
        ser.save()


# ---------- Statut de validation (persistant en base : Evaluation.statut) ----------
def statut_periode(cl, per):
    st = list(cl.evaluations.filter(periode=per).values_list("statut", flat=True))
    if not st:
        return "brouillon"
    if all(x == "valide" for x in st):
        return "valide"
    return "verifie" if all(x in ("verifie", "valide") for x in st) else "brouillon"


def verrouille(cl, per):
    if cl.evaluations.filter(periode=per, statut="valide").exists():
        raise Conflit()


def invalider_verification(cl, per):
    cl.evaluations.filter(periode=per, statut="verifie").update(statut="brouillon")


# ---------- Calculs de classe ----------
def calc_classe(classe, periode, c):
    data = defaultdict(lambda: defaultdict(list))
    ns = m.Note.objects.filter(evaluation__classe=classe, evaluation__periode=periode).exclude(valeur=None).select_related("evaluation")
    for n in ns:
        data[n.eleve_id][n.evaluation.matiere].append((n.valeur, n.evaluation.note_max, n.evaluation.coefficient))
    out = []
    for e in classe.eleves.all():
        mats = {k: C.moyenne_ponderee(v, c["base_moyenne"]) for k, v in sorted(data[e.id].items())}
        out.append({"eleve": e.id, "nom": str(e), "matieres": mats, "moyenne": C.moyenne_generale(mats.values())})
    if c["classement"]:
        rg = C.rangs({o["eleve"]: o["moyenne"] for o in out})
        for o in out:
            if o["eleve"] in rg:
                o["rang"] = rg[o["eleve"]]
    return out


def verif(cl, per, c):
    evs = cl.evaluations.filter(periode=per)
    n_el, att = cl.eleves.count(), cl.eleves.count() * evs.count()
    saisies = m.Note.objects.filter(evaluation__in=evs).exclude(valeur=None).count()
    res = calc_classe(cl, per, c)
    apps = m.Appreciation.objects.filter(eleve__classe=cl, periode=per, validee=True).exclude(texte="").count()
    pb = []
    if not evs.exists(): pb.append("Aucune évaluation pour cette période")
    if saisies < att: pb.append("Note manquante")
    if any(r["moyenne"] is None for r in res): pb.append("Élève sans résultat")
    if apps < n_el: pb.append("Information incomplète : appréciations à valider")
    return {"eleves": n_el, "notes_saisies": saisies, "notes_attendues": att, "appreciations": apps, "problemes": pb,
            "moyenne_generale": C.moyenne_generale(r["moyenne"] for r in res), "erreurs": 0,
            "statut": statut_periode(cl, per), "nb_evaluations": evs.count()}


class ClasseV(Owned):
    queryset, serializer_class = m.Classe.objects.all(), s.ClasseS

    def _per(self, req, requis=False):
        p = req.query_params.get("periode", "")
        if requis and not p:
            raise ValidationError({"periode": "Période requise."})
        return p

    @action(detail=True)
    def resultats(self, req, pk=None):
        return Response(calc_classe(self.get_object(), self._per(req), cfg(req.user)))

    @action(detail=True, methods=["get", "put"])
    def appreciations(self, req, pk=None):
        cl, per = self.get_object(), self._per(req)
        if req.method == "PUT":
            verrouille(cl, per)
            if not isinstance(req.data, list): raise ValidationError("Format invalide.")
            ids = set(cl.eleves.values_list("id", flat=True))
            with transaction.atomic():
                for r in req.data:
                    if not isinstance(r, dict) or r.get("eleve") not in ids: raise ValidationError("Élève inconnu dans cette classe.")
                    texte = str(r.get("texte", ""))[:1000].strip()
                    m.Appreciation.objects.update_or_create(eleve_id=r["eleve"], periode=per,
                        defaults={"texte": texte, "validee": bool(r.get("validee")) and bool(texte)})  # jamais validée sans texte
                invalider_verification(cl, per)
        return Response({a.eleve_id: {"texte": a.texte, "validee": a.validee} for a in m.Appreciation.objects.filter(eleve__classe=cl, periode=per)})

    @action(detail=True)
    def proposer(self, req, pk=None):  # PROPOSITIONS uniquement : validee=False, rien n'est enregistré
        c, out = cfg(req.user), {}
        for r in calc_classe(self.get_object(), self._per(req), c):
            if r["moyenne"] is not None:
                out[r["eleve"]] = {"texte": [a["texte"] for a in c["appreciations"] if r["moyenne"] / c["base_moyenne"] >= a["min"]][-1], "validee": False}
        return Response(out)

    @action(detail=True)
    def verification(self, req, pk=None):
        return Response(verif(self.get_object(), self._per(req), cfg(req.user)))

    @action(detail=True, methods=["post"])
    def verifier(self, req, pk=None):  # brouillon -> vérifiée
        cl, per = self.get_object(), self._per(req, True)
        evs = cl.evaluations.filter(periode=per)
        if not evs.exists(): raise ValidationError("Aucune évaluation pour cette période.")
        evs.filter(statut="brouillon").update(statut="verifie")
        return Response(verif(cl, per, cfg(req.user)))

    @action(detail=True, methods=["post"])
    def valider(self, req, pk=None):  # vérifiée -> validée (persistant)
        cl, per = self.get_object(), self._per(req, True)
        st = statut_periode(cl, per)
        if st == "valide": return Response(verif(cl, per, cfg(req.user)))
        if st != "verifie": raise Conflit("Vérifiez d'abord les résultats avant de les valider.")
        v = verif(cl, per, cfg(req.user))
        if v["problemes"] and not (isinstance(req.data, dict) and req.data.get("confirmer")):
            return Response({"detail": "Des points restent à vérifier.", "problemes": v["problemes"], "confirmation_requise": True}, status=409)
        cl.evaluations.filter(periode=per).update(statut="valide", valide_le=timezone.now())
        return Response(verif(cl, per, cfg(req.user)))

    @action(detail=True, methods=["post"])
    def rouvrir(self, req, pk=None):  # réouverture explicite : validée -> brouillon
        cl, per = self.get_object(), self._per(req, True)
        cl.evaluations.filter(periode=per).update(statut="brouillon", valide_le=None)
        return Response(verif(cl, per, cfg(req.user)))

    @action(detail=True)
    def bulletins(self, req, pk=None):
        """Données du bulletin/livret : uniquement à partir des résultats VALIDÉS et enregistrés.
        Un futur générateur PDF pourra consommer ce JSON sans réécrire le module."""
        cl, per, c = self.get_object(), self._per(req, True), cfg(req.user)
        if statut_periode(cl, per) != "valide":
            raise Conflit("Validez les résultats de cette période avant de générer les documents.")
        apps = {a.eleve_id: a.texte for a in m.Appreciation.objects.filter(eleve__classe=cl, periode=per, validee=True)}
        det = defaultdict(lambda: defaultdict(list))
        for n in m.Note.objects.filter(evaluation__classe=cl, evaluation__periode=per).exclude(valeur=None).select_related("evaluation").order_by("evaluation__date", "evaluation_id"):
            e = n.evaluation
            det[n.eleve_id][e.matiere].append({"titre": e.titre, "type": e.type, "note": float(n.valeur), "note_max": float(e.note_max), "coefficient": float(e.coefficient)})
        eleves = [{**r, "evaluations": det[r["eleve"]], "appreciation": apps.get(r["eleve"], "")} for r in calc_classe(cl, per, c)]
        return Response({"classe": {"id": cl.id, "niveau": cl.niveau, "nom": cl.nom, "annee_scolaire": cl.annee_scolaire},
                         "periode": per, "modele": c["modele_bulletin"], "classement": c["classement"], "base": c["base_moyenne"], "eleves": eleves})


class EleveV(Owned): queryset, serializer_class, owner, parent, filters = m.Eleve.objects.all(), s.EleveS, "classe__user", "classe", ["classe"]
class LeconV(Owned): queryset, serializer_class, filters = m.Lecon.objects.all(), s.LeconS, ["niveau", "matiere"]
class ExerciceV(Owned): queryset, serializer_class, owner, parent, filters = m.Exercice.objects.all(), s.ExerciceS, "fiche__user", "fiche", ["fiche"]


class FicheV(Owned):
    queryset, serializer_class = m.Fiche.objects.all(), s.FicheS
    filters = ["niveau", "matiere", "annee_scolaire", "lecon__icontains"]

    def perform_update(self, ser):
        old, new = ser.instance.sections, ser.validated_data.get("sections")
        ser.save(version_precedente=old) if new is not None and new != old else ser.save()  # 1 niveau d'historique

    @action(detail=True, methods=["post"])
    def restaurer(self, req, pk=None):
        f = self.get_object()
        if f.version_precedente is not None:
            f.sections, f.version_precedente = f.version_precedente, f.sections
            f.save()
        return Response(s.FicheS(f).data)

    @action(detail=True, methods=["post"])
    def dupliquer(self, req, pk=None):
        f = self.get_object(); ex = list(f.exercices.all())
        annee = req.data.get("annee_scolaire", f.annee_scolaire) if isinstance(req.data, dict) else f.annee_scolaire
        with transaction.atomic():
            f.pk, f.version_precedente, f.annee_scolaire = None, None, annee
            f.save()
            for e in ex:
                e.pk, e.fiche = None, f
                e.save()
        return Response(s.FicheS(f).data, status=201)


class EvaluationV(Owned):
    queryset, serializer_class, owner, parent = m.Evaluation.objects.all(), s.EvaluationS, "classe__user", "classe"
    filters = ["classe", "periode"]

    def perform_create(self, ser):
        self.check_parent(ser)
        verrouille(ser.validated_data["classe"], ser.validated_data["periode"])
        ser.save()

    def perform_update(self, ser):
        ev = ser.instance
        if ev.statut == "valide": raise Conflit()
        self.check_parent(ser)
        cl, per = ser.validated_data.get("classe", ev.classe), ser.validated_data.get("periode", ev.periode)
        if (cl, per) != (ev.classe, ev.periode): verrouille(cl, per)
        nm = ser.validated_data.get("note_max")
        if nm is not None and ev.notes.filter(valeur__gt=nm).exists():
            raise ValidationError({"note_max": "Certaines notes dépassent cette note maximale."})
        ser.save(statut="brouillon" if ev.statut == "verifie" else ev.statut)

    def perform_destroy(self, inst):
        if inst.statut == "valide": raise Conflit()
        inst.delete()

    @action(detail=True, methods=["get", "put"])
    def notes(self, req, pk=None):
        ev = self.get_object()
        if req.method == "PUT":
            if ev.statut == "valide": raise Conflit()
            if not isinstance(req.data, list): raise ValidationError("Format invalide.")
            ids, clean, erreurs = set(ev.classe.eleves.values_list("id", flat=True)), [], {}
            for r in req.data:
                if not isinstance(r, dict) or r.get("eleve") not in ids: raise ValidationError("Élève inconnu dans cette classe.")
                try:
                    clean.append((r["eleve"], C.lire_note(r.get("valeur"), ev.note_max), str(r.get("observation", ""))[:255]))
                except ValueError as e:
                    erreurs[r["eleve"]] = str(e)
            if erreurs:  # tout ou rien : aucune note n'est enregistrée à moitié
                return Response({"detail": "Certaines notes sont invalides.", "erreurs": erreurs}, status=400)
            with transaction.atomic():
                for eid, v, obs in clean:
                    m.Note.objects.update_or_create(evaluation=ev, eleve_id=eid, defaults={"valeur": v, "observation": obs})
                if ev.statut == "verifie":  # une modification annule la vérification
                    ev.statut = "brouillon"; ev.save(update_fields=["statut"])
        ns = {n.eleve_id: n for n in ev.notes.all()}
        return Response([{"eleve": e.id, "nom": str(e), "valeur": ns[e.id].valeur if e.id in ns else None,
                          "observation": ns[e.id].observation if e.id in ns else ""} for e in ev.classe.eleves.all()])

    @action(detail=True)
    def resultats(self, req, pk=None):
        ev, c = self.get_object(), cfg(req.user)
        rows = [(n.eleve, float(n.valeur)) for n in ev.notes.exclude(valeur=None).select_related("eleve")]
        mx, vals = float(ev.note_max), [v for _, v in rows]
        liste = [{"eleve": e.id, "nom": str(e), "note": v, "sur_base": float(C.arrondi(v / mx * c["base_moyenne"]))} for e, v in rows]
        if c["classement"]:
            rg = C.rangs({x["eleve"]: x["note"] for x in liste})
            for x in liste: x["rang"] = rg[x["eleve"]]
            liste.sort(key=lambda x: (x["rang"], x["nom"]))
        return Response({"effectif": ev.classe.eleves.count(), "saisies": len(vals), "note_max": mx, "statut": ev.statut,
            "moyenne": C.moyenne_generale(vals), "meilleure": max(vals, default=None), "minimale": min(vals, default=None),
            "distribution": C.repartition(vals, mx), "eleves": liste, "classement": c["classement"]})


router = routers.DefaultRouter()
for p, v in [("classes", ClasseV), ("eleves", EleveV), ("lecons", LeconV), ("fiches", FicheV), ("exercices", ExerciceV), ("evaluations", EvaluationV)]:
    router.register(p, v, basename=p)


@api_view(["GET"])
def me(req): return Response({"nom": req.user.get_full_name() or req.user.username})


@api_view(["GET", "PUT"])
def parametres(req):
    p, _ = m.Parametres.objects.get_or_create(user=req.user)
    if req.method == "PUT":
        p.config = {**p.config, **nettoyer_config(req.data)}
        p.save()
    return Response(cfg(req.user))
