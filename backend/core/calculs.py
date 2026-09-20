"""Calculs de notes : fonctions pures, sans dépendance Django (testables seules).

RÈGLES PROVISOIRES DE DÉVELOPPEMENT — NON OFFICIELLES :
- chaque note est ramenée sur `base` (20 par défaut, configurable) ;
- moyenne d'une matière = moyenne pondérée par les coefficients des évaluations ;
- moyenne générale = moyenne simple des moyennes de matières (sans coefficient de matière) ;
- arrondi à 2 décimales (demi vers le haut) ;
- classement : ex aequo = même rang (1, 1, 3).
À remplacer/valider selon les pratiques pédagogiques et administratives réellement utilisées.
"""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

_Q = Decimal("0.01")


def _d(x):
    return x if isinstance(x, Decimal) else Decimal(str(x))


def arrondi(x):
    return _d(x).quantize(_Q, rounding=ROUND_HALF_UP)


def lire_note(brut, note_max):
    """Retourne un Decimal, ou None si la note est vide (= manquante). ValueError si invalide."""
    if brut is None or (isinstance(brut, str) and not brut.strip()):
        return None
    try:
        v = Decimal(str(brut).strip().replace(",", "."))
    except InvalidOperation:
        raise ValueError("La note doit être un nombre.")
    if not v.is_finite():
        raise ValueError("La note doit être un nombre.")
    try:
        v = arrondi(v)
    except InvalidOperation:  # valeur démesurée (ex. 1e999999)
        raise ValueError("La note doit être un nombre.")
    if v < 0:
        raise ValueError("La note ne peut pas être négative.")
    if v > _d(note_max):
        raise ValueError(f"La note ne peut pas dépasser {_d(note_max).normalize():f}.")
    return v


def moyenne_ponderee(items, base=20):
    """items : (valeur, note_max, coefficient). Retourne un float, ou None s'il n'y a rien à calculer."""
    items = [i for i in items if _d(i[1]) > 0]
    total = sum((_d(c) for _, _, c in items), Decimal(0))
    if not items or total <= 0:
        return None
    s = sum((_d(v) / _d(mx) * _d(base) * _d(c) for v, mx, c in items), Decimal(0))
    return float(arrondi(s / total))


def moyenne_generale(moyennes):
    vals = [_d(x) for x in moyennes if x is not None]
    return float(arrondi(sum(vals, Decimal(0)) / len(vals))) if vals else None


def rangs(valeurs):
    """{id: valeur ou None} -> {id: rang}. Ex aequo = même rang ; les valeurs None sont exclues."""
    ok = {k: v for k, v in valeurs.items() if v is not None}
    return {k: 1 + sum(1 for w in ok.values() if w > v) for k, v in ok.items()}


def repartition(valeurs, note_max):
    """Nombre de notes par quart de la note maximale (0-25 %, 25-50 %, 50-75 %, 75-100 %)."""
    out = [0] * 4
    for v in valeurs:
        out[min(int(float(v) / float(note_max) * 4), 3)] += 1
    return out
