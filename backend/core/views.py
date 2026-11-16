import re
import unicodedata
from collections import defaultdict
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import routers, viewsets
from django.contrib.auth.password_validation import validate_password
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.serializers import AuthTokenSerializer
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import APIException, MethodNotAllowed, ValidationError
from rest_framework.permissions import AllowAny, IsAdminUser
from rest_framework.response import Response
from . import calculs as C, models as m, referentiel as R, serializers as s
from .auth import token_valide

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
    "appreciations": [  # barème appliqué AUTOMATIQUEMENT aux moyennes (remplissage sans saisie de l'enseignant)
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


# ---------- Appréciations : déduites automatiquement des moyennes (aucune saisie de l'enseignant) ----------
def appreciations_auto(classe, periode, c):
    """{eleve_id: texte} : appréciation déduite de la moyenne de la période par le barème des Paramètres.
    Un élève sans note n'a pas d'appréciation (None) : rien ne lui est inventé."""
    return {r["eleve"]: C.appreciation_auto(r["moyenne"], c["base_moyenne"], c["appreciations"])
            for r in calc_classe(classe, periode, c)}


def appreciations_effectives(classe, periode, c):
    """Appréciation RETENUE pour chaque élève, sans que l'enseignant ait à la saisir.

    - l'application remplit l'appréciation à partir de la moyenne (barème des Paramètres) ;
    - un texte écrit ET validé par l'enseignant prévaut sur la règle : son jugement reste premier ;
    - un texte écrit mais non validé reste un brouillon : il n'est jamais retenu (bulletin compris),
      l'appréciation automatique est utilisée à sa place.

    Retourne {eleve_id: {"texte", "auto", "source", "brouillon", "validee"}} :
      texte     : texte retenu (affiché dans l'application et imprimé sur le bulletin)
      auto      : texte produit par la règle automatique ("" si aucune note)
      source    : "enseignant" (texte validé par l'enseignant) ou "auto" (règle de l'application)
      brouillon : texte enregistré mais non validé ("" s'il n'y en a pas)
      validee   : True si le texte retenu a été validé par l'enseignant
    """
    autos = appreciations_auto(classe, periode, c)
    enr = {a.eleve_id: a for a in m.Appreciation.objects.filter(eleve__classe=classe, periode=periode)}
    out = {}
    for eid, auto in autos.items():
        a = enr.get(eid)
        ecrit = a.texte.strip() if a else ""
        if ecrit and a.validee:
            out[eid] = {"texte": ecrit, "auto": auto or "", "source": "enseignant", "brouillon": "", "validee": True}
        else:
            out[eid] = {"texte": auto or "", "auto": auto or "", "source": "auto", "brouillon": ecrit, "validee": False}
    return out


def verif(cl, per, c):
    evs = cl.evaluations.filter(periode=per)
    n_el, att = cl.eleves.count(), cl.eleves.count() * evs.count()
    saisies = m.Note.objects.filter(evaluation__in=evs).exclude(valeur=None).count()
    res = calc_classe(cl, per, c)
    appr = appreciations_effectives(cl, per, c)
    auto = sum(1 for x in appr.values() if x["source"] == "auto" and x["texte"])
    perso = sum(1 for x in appr.values() if x["source"] == "enseignant")
    brouillons = sum(1 for x in appr.values() if x["brouillon"])
    pb = []
    if not evs.exists(): pb.append("Aucune évaluation pour cette période")
    if saisies < att: pb.append("Note manquante")
    if any(r["moyenne"] is None for r in res): pb.append("Élève sans résultat")
    # Les appréciations ne bloquent plus la validation : elles sont déduites des moyennes, rien n'est à saisir.
    infos = []
    if auto: infos.append(f"{auto} appréciation(s) déduite(s) automatiquement des moyennes")
    if perso: infos.append(f"{perso} appréciation(s) personnalisée(s) et validée(s) par vous")
    if brouillons: infos.append(f"{brouillons} texte(s) personnalisé(s) non validé(s) : l'appréciation automatique est utilisée")
    return {"eleves": n_el, "notes_saisies": saisies, "notes_attendues": att,
            "appreciations": auto + perso, "appreciations_auto": auto, "appreciations_personnalisees": perso,
            "appreciations_brouillon": brouillons, "informations": infos, "problemes": pb,
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
        """GET : appréciations déjà remplies (barème appliqué aux moyennes) — l'enseignant n'a rien à saisir.
        PUT : enregistre les textes qu'il décide de figer ; un texte validé prévaut alors sur la règle."""
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
        return Response(appreciations_effectives(cl, per, cfg(req.user)))

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
        L'appréciation est celle retenue par le serveur (règle automatique, ou texte validé par l'enseignant).
        Un futur générateur PDF pourra consommer ce JSON sans réécrire le module."""
        cl, per, c = self.get_object(), self._per(req, True), cfg(req.user)
        if statut_periode(cl, per) != "valide":
            raise Conflit("Validez les résultats de cette période avant de générer les documents.")
        appr = appreciations_effectives(cl, per, c)
        det = defaultdict(lambda: defaultdict(list))
        for n in m.Note.objects.filter(evaluation__classe=cl, evaluation__periode=per).exclude(valeur=None).select_related("evaluation").order_by("evaluation__date", "evaluation_id"):
            e = n.evaluation
            det[n.eleve_id][e.matiere].append({"titre": e.titre, "type": e.type, "note": float(n.valeur), "note_max": float(e.note_max), "coefficient": float(e.coefficient)})
        eleves = [{**r, "evaluations": det[r["eleve"]], "appreciation": appr.get(r["eleve"], {}).get("texte", ""),
                   "appreciation_auto": appr.get(r["eleve"], {}).get("source") == "auto"} for r in calc_classe(cl, per, c)]
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

    @action(detail=False, methods=["post"])
    def generer(self, req):
        """Génère une fiche à partir d'une séance du référentiel (guide) : {"seance": id, "annee_scolaire"?}.
        La fiche créée appartient à l'enseignant et reste entièrement modifiable ; le guide n'est jamais modifié."""
        sid = req.data.get("seance") if isinstance(req.data, dict) else None
        ctx = R.trouver_seance(str(sid or ""))
        if not ctx:
            raise ValidationError({"seance": "Séance introuvable dans le référentiel."})
        d = R.fiche_depuis_seance(ctx)
        annee = str(req.data.get("annee_scolaire") or cfg(req.user)["annee_scolaire"] or "")[:9]
        f = m.Fiche.objects.create(user=req.user, annee_scolaire=annee, **d)
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


# ---------- Demande de compte : seul point d'entrée ouvert sans compte ----------
class DemandeCompteV(viewsets.ModelViewSet):
    """Dépôt d'une demande d'ouverture de compte depuis l'écran de connexion.
    Une seule méthode est exposée (POST) : la lecture est fermée pour ne pas exposer les pièces
    d'identité ; l'administrateur consulte et traite les demandes dans /admin/.
    Aucun compte n'est créé ici (pas d'inscription automatique)."""
    queryset = m.DemandeCompte.objects.all()
    serializer_class = s.DemandeCompteS
    permission_classes = [AllowAny]
    authentication_classes = []  # jeton absent ou expiré : la demande doit rester possible
    http_method_names = ["post"]


# ---------- Gestion des demandes de compte : réservée aux administrateurs ----------
# La sécurité est assurée ICI, côté serveur (IsAdminUser) : masquer la page dans l'interface ne protège rien.
def identifiant_libre(nom):
    """Identifiant lisible et unique dérivé du nom complet (ex. « Aïssatou Diop » -> aissatou.diop)."""
    base = unicodedata.normalize("NFKD", str(nom)).encode("ascii", "ignore").decode().lower()
    base = re.sub(r"[^a-z0-9]+", ".", base).strip(".")[:24] or "enseignant"
    u, n = base, 1
    while get_user_model().objects.filter(username=u).exists():
        n += 1
        u = f"{base}{n}"
    return u


class DemandesCompteAdminV(viewsets.ModelViewSet):
    """Consultation et traitement des demandes d'ouverture de compte : COMPTES ADMINISTRATEURS UNIQUEMENT
    (is_staff/superutilisateur). Aucun compte n'est créé automatiquement, la lecture est refusée aux enseignants."""
    queryset = m.DemandeCompte.objects.select_related("traite_par")
    serializer_class = s.DemandeCompteAdminS
    permission_classes = [IsAdminUser]
    # « post » est nécessaire à l'action « creer-compte » ; la création d'une demande reste impossible ici (voir create).
    http_method_names = ["get", "post", "patch", "delete"]

    def create(self, req, *a, **k):
        """Aucune demande ne se crée depuis cette route : elles viennent de l'écran de connexion public."""
        raise MethodNotAllowed("POST", detail="Une demande se dépose depuis l'écran de connexion, pas ici.")

    def get_queryset(self):
        qs, f = super().get_queryset(), self.request.query_params
        if f.get("statut") in dict(m.STATUTS_DEMANDE): qs = qs.filter(statut=f["statut"])
        if f.get("region") in m.REGIONS: qs = qs.filter(region=f["region"])
        if f.get("q"):  # recherche : nom, téléphone, e-mail, IA, IEF, numéro de pièce
            q = f["q"].strip()[:60]
            qs = qs.filter(Q(nom_complet__icontains=q) | Q(telephone__icontains=q) | Q(email__icontains=q) |
                           Q(ia__icontains=q) | Q(ief__icontains=q) | Q(numero_piece__icontains=q))
        return qs

    def perform_update(self, ser):  # toute modification est horodatée et attribuée à son auteur
        ser.save(traite_le=timezone.now(), traite_par=self.request.user)

    @action(detail=True, methods=["post"], url_path="creer-compte")
    def creer_compte(self, req, pk=None):
        """Crée le compte de l'enseignant, sur décision explicite d'un administrateur.
        Le mot de passe temporaire est renvoyé UNE SEULE FOIS : il n'est ni enregistré ni journalisé."""
        d = self.get_object()
        if d.compte_cree:
            raise ValidationError({"detail": f"Un compte a déjà été créé pour cette demande ({d.compte_cree})."})
        username = str(req.data.get("username") or "").strip() or identifiant_libre(d.nom_complet)
        if not re.fullmatch(r"[\w.@+-]{3,150}", username):
            raise ValidationError({"username": "Identifiant invalide : 3 caractères minimum (lettres, chiffres, . @ + - _)."})
        if get_user_model().objects.filter(username=username).exists():
            raise ValidationError({"username": "Cet identifiant est déjà utilisé."})
        mots = d.nom_complet.split()
        mdp = get_random_string(10, "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ") + get_random_string(4, "23456789")
        with transaction.atomic():
            get_user_model().objects.create_user(username=username, password=mdp,
                                                first_name=" ".join(mots[:-1])[:150], last_name=(mots[-1] if mots else "")[:150])
            d.statut, d.compte_cree, d.traite_le, d.traite_par = "traitee", username, timezone.now(), req.user
            d.note = (d.note + "\n" if d.note else "") + f"Compte {username} créé le {timezone.localtime().strftime('%d/%m/%Y à %H:%M')}."
            d.save()
        return Response({"id": d.id, "nom_complet": d.nom_complet, "username": username, "mot_de_passe": mdp, "statut": d.statut,
                         "message": "Notez ce mot de passe : il ne sera plus affiché. L'enseignant pourra le changer dans « Paramètres »."})


router = routers.DefaultRouter()
for p, v in [("classes", ClasseV), ("eleves", EleveV), ("lecons", LeconV), ("fiches", FicheV), ("exercices", ExerciceV), ("evaluations", EvaluationV)]:
    router.register(p, v, basename=p)
router.register("demandes-compte", DemandeCompteV, basename="demandes-compte")
router.register("admin/demandes-compte", DemandesCompteAdminV, basename="demandes-compte-admin")


@api_view(["GET"])
def me(req):
    # est_admin : sert à n'afficher le menu d'administration qu'aux personnes concernées.
    # La vraie protection reste le contrôle d'accès des vues, côté serveur.
    # La photo est relue en base (et non par le lien `user.profil`, qui peut rester en cache sur l'instance) :
    # une photo ajoutée ou retirée est donc reflétée immédiatement.
    photo = m.Profil.objects.filter(user=req.user).values_list("photo", flat=True).first() or ""
    return Response({"nom": req.user.get_full_name() or req.user.username,
                     "est_admin": bool(req.user.is_staff or req.user.is_superuser),
                     "photo": f"{settings.MEDIA_URL}{photo}" if photo else ""})


@api_view(["GET", "PUT"])
def parametres(req):
    p, _ = m.Parametres.objects.get_or_create(user=req.user)
    if req.method == "PUT":
        p.config = {**p.config, **nettoyer_config(req.data)}
        p.save()
    return Response(cfg(req.user))


CHAMPS_PROFIL = ("civilite", "telephone", "email", "matricule", "corps", "ecole", "region", "ia", "ief")


@api_view(["GET", "PUT", "PATCH"])
def profil(req):
    """Profil de l'enseignant : coordonnées et informations professionnelles, créées à la première écriture.
    Le serveur impose le propriétaire — un enseignant ne lit ni ne modifie le profil d'un autre.
    `nom`/`prenom` mettent à jour le compte lui-même (c'est ce nom qu'affiche /api/me/) : un champ laissé
    vide ne remplace pas la valeur existante."""
    p, _ = m.Profil.objects.get_or_create(user=req.user)
    if req.method != "GET":
        ser = s.ProfilS(p, data={k: v for k, v in req.data.items() if k in CHAMPS_PROFIL}, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        if "nom" in req.data or "prenom" in req.data:
            nom, prenom = str(req.data.get("nom") or "").strip()[:150], str(req.data.get("prenom") or "").strip()[:150]
            req.user.last_name, req.user.first_name = nom or req.user.last_name, prenom or req.user.first_name
            req.user.save(update_fields=["last_name", "first_name"])
    return Response(s.ProfilS(p).data)


@api_view(["POST", "DELETE"])
def profil_photo(req):
    """Photo de profil (envoi multipart : JPEG, PNG ou WebP, 2 Mo maximum) ou retrait de la photo.
    La photo remplacée est effacée du disque : aucun fichier orphelin ne s'accumule."""
    p, _ = m.Profil.objects.get_or_create(user=req.user)
    if req.method == "DELETE":
        p.photo.delete(save=True)
        return Response(s.ProfilS(p).data)
    ser = s.PhotoS(p, data=req.data, partial=True)
    ser.is_valid(raise_exception=True)
    ancienne = p.photo.name
    ser.save()
    if ancienne and ancienne != p.photo.name:
        p.photo.storage.delete(ancienne)
    return Response(s.ProfilS(p).data)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def connexion(req):
    """Connexion : renvoie le token de l'enseignant ; un token expiré est remplacé (sinon il serait renvoyé
    tel quel puis refusé à la requête suivante). Limitation : 30 requêtes/minute par IP (AnonRateThrottle)."""
    ser = AuthTokenSerializer(data=req.data, context={"request": req})
    ser.is_valid(raise_exception=True)
    return Response({"token": token_valide(ser.validated_data["user"]).key})


@api_view(["POST"])
def deconnexion(req):
    """Révoque le token de cet appareil : un token copié ou un appareil perdu ne donne plus accès."""
    if isinstance(req.auth, Token):
        req.auth.delete()
    return Response(status=204)


@api_view(["POST"])
def mot_de_passe(req):
    """Changement du mot de passe par l'enseignant (notamment le mot de passe temporaire remis par l'administrateur).
    Toutes les sessions du compte sont révoquées ; l'appareil courant reçoit un nouveau token."""
    ancien, nouveau = str(req.data.get("ancien") or ""), str(req.data.get("nouveau") or "")
    if not req.user.check_password(ancien):
        raise ValidationError({"ancien": "Mot de passe actuel incorrect."})
    if nouveau == ancien:
        raise ValidationError({"nouveau": "Le nouveau mot de passe doit être différent de l'actuel."})
    try:
        validate_password(nouveau, req.user)
    except DjangoValidationError as e:
        raise ValidationError({"nouveau": list(e.messages)})
    req.user.set_password(nouveau)
    req.user.save(update_fields=["password"])
    Token.objects.filter(user=req.user).delete()
    return Response({"token": Token.objects.create(user=req.user).key, "detail": "Mot de passe modifié."})


@api_view(["GET"])
def referentiel_pedagogique(req):
    """Référentiel pédagogique (guides transcrits, lecture seule).
    Sans paramètre : sommaire (guides, niveaux, activités). Avec ?niveau=CI : activités et séances de ce niveau."""
    niveau = req.query_params.get("niveau")
    if niveau is None:
        return Response(R.sommaire())
    if niveau not in R.NIVEAUX:
        raise ValidationError({"niveau": "Niveau inconnu."})
    return Response(R.pour_niveau(niveau))
