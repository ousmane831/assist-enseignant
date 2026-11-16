"""Référentiel pédagogique : les guides officiels transcrits en données structurées, et la génération de fiches.

Principes :
- les guides sont la SOURCE, en lecture seule : fichiers JSON de core/data/referentiel/ (un par étape) ;
- une fiche générée est une COPIE appartenant à l'enseignant : il la modifie librement, et une mise à jour du
  référentiel ne la touche jamais (Fiche.origine garde seulement la trace de la source) ;
- aucune IA : objectifs, contenus, critères et situations sont repris du guide ; seul le déroulement suit un canevas
  de l'application, présenté comme tel et à adapter ;
- fidélité contrôlée : `verifier_fidelite` vérifie que chaque mot transcrit figure dans le PDF, aux pages citées
  (commande `manage.py verifier_referentiel`).

Structure d'un fichier : guide → activites → paliers → oa → seances (une séance = un objectif spécifique (OS)
avec ses contenus = une fiche ; `duree` facultative à chaque niveau : palier, OA, séance). Les contenus absents d'une séance sont hérités de l'OA, puis du palier
(cellules fusionnées dans les tableaux du guide).
"""
import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

DOSSIER = Path(__file__).resolve().parent / "data" / "referentiel"
NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"]


# ---------- Chargement ----------
@lru_cache(maxsize=1)
def guides():
    """Tous les guides transcrits, triés par étape."""
    return sorted((json.loads(f.read_text(encoding="utf-8")) for f in DOSSIER.glob("*.json")),
                  key=lambda g: g["guide"]["etape"])


def parcourir(donnees=None):
    """Itère (guide, activite, palier, oa, seance) sur tout le référentiel (ou sur `donnees` : liste de guides)."""
    for g in donnees if donnees is not None else guides():
        for a in g["activites"]:
            for p in a["paliers"]:
                for oa in p["oa"]:
                    for s in oa["seances"]:
                        yield g, a, p, oa, s


def contenus_effectifs(p, oa, s):
    return s.get("contenus") or oa.get("contenus") or p.get("contenus") or ""


def trouver_seance(seance_id):
    for ctx in parcourir():
        if ctx[4]["id"] == seance_id:
            return ctx
    return None


# ---------- API : vues filtrées ----------
def _meta(g):
    return {k: g["guide"][k] for k in ("id", "nom", "etape", "niveaux", "nombre_pages")}


def sommaire():
    """Vue d'ensemble : guides, niveaux couverts et activités transcrites (sans le détail des séances)."""
    activites = []
    for g in guides():
        for a in g["activites"]:
            niveaux = [n for n in NIVEAUX if any(p["niveau"] == n for p in a["paliers"])]
            nb = sum(len(oa["seances"]) for p in a["paliers"] for oa in p["oa"])
            activites.append({"id": a["id"], "guide": g["guide"]["id"], "domaine": a["domaine"], "activite": a["activite"],
                              "matiere": a["matiere"], "niveaux": niveaux, "seances": nb})
    return {"guides": [_meta(g) for g in guides()], "niveaux": sorted({n for a in activites for n in a["niveaux"]}, key=NIVEAUX.index),
            "activites": activites}


def pour_niveau(niveau):
    """Activités d'un niveau, avec leurs seuls paliers de ce niveau (contenus hérités déjà résolus)."""
    out = []
    for g in guides():
        for a in g["activites"]:
            paliers = [p for p in a["paliers"] if p["niveau"] == niveau]
            if not paliers:
                continue
            paliers = [{**p, "oa": [{**oa, "seances": [{**s, "contenus": contenus_effectifs(p, oa, s)} for s in oa["seances"]]}
                                    for oa in p["oa"]]} for p in paliers]
            out.append({**{k: v for k, v in a.items() if k != "paliers"}, "guide": _meta(g), "paliers": paliers})
    return {"niveau": niveau, "activites": out}


# ---------- Génération d'une fiche ----------
def _pages(p):
    a, b = p["pages"]
    return f"p. {a}" if a == b else f"p. {a}-{b}"


def _situation(sit):
    lignes = [f"Contexte : {sit['contexte']}", f"Consigne : {sit['consigne']}"]
    if sit.get("production_attendue"):
        lignes.append(f"Production attendue : {sit['production_attendue']}")
    if sit.get("indications"):
        lignes.append(f"Indications pour la passation : {sit['indications']}")
    return "\n".join(lignes)


def fiche_depuis_seance(ctx):
    """Données d'une nouvelle fiche (niveau, matière, domaine, leçon, sections, origine) pour la séance `ctx`.
    Tout ce qui vient du guide est repris tel quel ; le déroulement est un canevas annoncé comme tel."""
    g, a, p, oa, s = ctx
    contenus = contenus_effectifs(p, oa, s)
    memes = [x for x in oa["seances"] if x["os"] == s["os"]]
    titre = s["os"] + (f" (séance {memes.index(s) + 1}/{len(memes)})" if len(memes) > 1 else "")
    # OA désigné seulement par un numéro dans certains tableaux du guide : intitulé vide, affiché « OA n ».
    oa_titre = " — ".join(x for x in (f"OA {oa['numero']}" if oa.get("numero") else "", oa.get("intitule", "")) if x)
    contenus_ligne = re.sub(r"\s*\n\s*", " ; ", contenus).strip()
    deroulement = "\n".join([
        "Canevas proposé par l'application (ne figure pas dans le guide) : à adapter à votre classe.",
        "1. Mise en situation : rappel des acquis utiles et présentation de la situation de départ.",
        f"2. Présentation : amener les élèves à « {s['os']} ».",
        f"3. Activités d'apprentissage : découverte, puis manipulation et réemploi de : {contenus_ligne}." if contenus_ligne
        else "3. Activités d'apprentissage : découverte, manipulation et réemploi.",
        "4. Synthèse : faire formuler par les élèves ce qu'ils ont appris.",
        "5. Évaluation : vérifier l'atteinte de l'objectif spécifique au regard des critères.",
        "6. Remédiation : reprendre avec les élèves qui n'ont pas atteint l'objectif.",
    ])
    evaluation = "Critères d'évaluation (guide) :\n" + "\n".join(f"- {c}" for c in a.get("criteres", []))
    if p.get("integration"):
        evaluation += f"\n\nSituation d'intégration du palier (guide) :\n{_situation(p['integration'])}"
    sections = [
        {"titre": "Repères", "contenu": f"{a['domaine']} — {a['activite']}\nNiveau : {p['niveau']} · Palier {p['numero']}\nDurée du palier : {p.get('duree') or '—'}"
                                        + (f"\nDurée (OA) : {oa['duree']}" if oa.get("duree") else "")
                                        + (f"\nDurée de la séance : {s['duree']}" if s.get("duree") else "")},
        {"titre": "Compétence de base", "contenu": a.get("competence_base", "")},
        {"titre": f"Palier {p['numero']}", "contenu": p["intitule"]},
        {"titre": "Objectif d'apprentissage (OA)", "contenu": oa_titre},
        {"titre": "Objectif spécifique (OS)", "contenu": s["os"]},
        {"titre": "Contenus", "contenu": contenus},
        {"titre": "Matériel", "contenu": ""},
        {"titre": "Déroulement", "contenu": deroulement},
        {"titre": "Évaluation", "contenu": evaluation},
    ]
    if p.get("remarque"):
        sections.append({"titre": "Remarque du guide", "contenu": p["remarque"]})
    sections.append({"titre": "Source", "contenu": f"{g['guide']['nom']}, {_pages(p)}. Compétence, palier, objectifs, contenus, critères et "
                                                    "situations repris du guide ; déroulement proposé par l'application."})
    return {"niveau": p["niveau"], "matiere": a["matiere"], "domaine": a["activite"][:80], "lecon": titre[:200], "sections": sections,
            "origine": {"guide": g["guide"]["id"], "activite": a["id"], "seance": s["id"], "pages": p["pages"]}}


# ---------- Contrôles ----------
def valider_structure(donnees):
    """Erreurs de structure d'un guide (liste vide si tout est correct). Sans PDF : exécuté par les tests."""
    err, ids = [], set()
    g = donnees.get("guide", {})
    for k in ("id", "nom", "etape", "niveaux", "nombre_pages"):
        if k not in g:
            err.append(f"guide.{k} manquant")
    for a in donnees.get("activites", []):
        for k in ("id", "domaine", "activite", "matiere", "competence_base", "paliers"):
            if not a.get(k):
                err.append(f"{a.get('id')}: {k} manquant")
        numeros = [p.get("numero") for p in a.get("paliers", [])]
        if len(numeros) != len(set(numeros)):
            err.append(f"{a.get('id')}: numéros de paliers en double")
        for p in a.get("paliers", []):
            lieu = f"{a.get('id')} palier {p.get('numero')}"
            if p.get("niveau") not in g.get("niveaux", []):
                err.append(f"{lieu}: niveau {p.get('niveau')!r} hors du guide")
            pg = p.get("pages") or []
            if len(pg) != 2 or not 1 <= pg[0] <= pg[1] <= g.get("nombre_pages", 0):
                err.append(f"{lieu}: pages invalides {pg}")
            if not p.get("intitule") or not p.get("oa"):
                err.append(f"{lieu}: intitulé ou OA manquant")
            for oa in p.get("oa", []):
                if not (oa.get("intitule") or oa.get("numero")) or not oa.get("seances"):
                    err.append(f"{lieu}: OA sans intitulé ni numéro, ou sans séance")
                for s in oa.get("seances", []):
                    if not s.get("id") or not s.get("os"):
                        err.append(f"{lieu}: séance sans id ou sans OS")
                    elif s["id"] in ids:
                        err.append(f"{lieu}: id de séance en double {s['id']}")
                    ids.add(s.get("id"))
                    if not contenus_effectifs(p, oa, s):
                        err.append(f"{lieu}: séance {s.get('id')} sans contenus (ni hérités)")
    return err


def mots(texte):
    """Mots significatifs (3 lettres ou plus), sans accents ni casse : base de la comparaison avec le PDF."""
    t = re.sub(r"[’'`´]", " ", str(texte))  # « d’énoncés » = « d » + « énoncés » (et non « denonces »)
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return [m for m in re.findall(r"[a-z0-9]+", t) if len(m) >= 3]


def verifier_fidelite(donnees, texte_pages, marge=1):
    """Compare la transcription au texte du PDF. `texte_pages` : {numéro de page: texte}.
    Chaque champ transcrit doit avoir tous ses mots présents dans les pages citées (± `marge` page, car un tableau
    déborde parfois). Retourne la liste des écarts : [(lieu, champ, mots absents)]."""
    ecarts = []

    def controler(lieu, champ, texte, pages):
        a, b = pages
        source = set(mots(" ".join(texte_pages.get(n, "") for n in range(a - marge, b + marge + 1))))
        absents = sorted({m for m in mots(texte) if m not in source})
        if absents:
            ecarts.append((lieu, champ, absents))

    for a in donnees["activites"]:
        for champ in ("competence_base",):
            controler(a["id"], champ, a[champ], a["pages"])
        for c in a.get("criteres", []):
            controler(a["id"], "criteres", c, a["pages"])
        for p in a["paliers"]:
            lieu, pg = f"{a['id']} palier {p['numero']}", p["pages"]
            for champ in ("intitule", "duree", "remarque", "contenus"):
                if p.get(champ):
                    controler(lieu, champ, p[champ], pg)
            for cle in ("integration", "evaluation"):
                for champ, texte in (p.get(cle) or {}).items():
                    controler(lieu, f"{cle}.{champ}", texte, pg)
            for oa in p["oa"]:
                for champ in ("intitule", "duree", "contenus"):
                    if oa.get(champ):
                        controler(lieu, f"OA {oa.get('numero')} {oa.get('intitule', '')[:30]} · {champ}", oa[champ], pg)
                for s in oa["seances"]:
                    controler(lieu, f"{s['id']} · os", s["os"], pg)
                    for champ in ("contenus", "duree"):
                        if s.get(champ):
                            controler(lieu, f"{s['id']} · {champ}", s[champ], pg)
    return ecarts
