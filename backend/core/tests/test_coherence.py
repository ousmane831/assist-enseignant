"""Cohérence des listes de choix entre le serveur et l'interface.

Les régions, pièces d'identité et corps sont recopiés dans frontend/src/pages.jsx : l'interface doit pouvoir
les afficher hors connexion et sur l'écran de demande de compte (avant toute connexion). Ce test garantit que les
deux copies restent identiques : une valeur proposée par l'interface mais refusée par le serveur serait un piège.
"""
import re
import unittest

from django.conf import settings
from django.test import SimpleTestCase

from core import models as m

PAGES = settings.BASE_DIR.parent / "frontend" / "src" / "pages.jsx"


def constante(source, nom):
    """Texte de la déclaration `const NOM = [...];` dans le code de l'interface."""
    trouve = re.search(rf"const {nom} = (\[.*?\]);", source, re.S)
    if not trouve:
        raise AssertionError(f"Constante {nom} introuvable dans pages.jsx")
    return trouve.group(1)


def premiers_elements(tableau):
    """Valeurs d'une liste simple ["a", "b"] ou première valeur de chaque paire [["a", "A"], ...]."""
    if re.match(r"\[\s*\[", tableau):  # liste de paires [valeur, libellé]
        return re.findall(r'\[\s*"([^"]*)"\s*,', tableau[1:])
    return re.findall(r'"([^"]*)"', tableau)


@unittest.skipUnless(PAGES.exists(), "code de l'interface absent")
class ListesPartagees(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.source = PAGES.read_text(encoding="utf-8")

    def test_regions(self):
        self.assertEqual(premiers_elements(constante(self.source, "REGIONS")), m.REGIONS)

    def test_pieces_d_identite(self):
        self.assertEqual(premiers_elements(constante(self.source, "PIECES")), [v for v, _ in m.PIECES])

    def test_corps(self):
        # L'interface ajoute une option vide en tête (champ facultatif).
        self.assertEqual(premiers_elements(constante(self.source, "CORPS")), [""] + [v for v, _ in m.CORPS])

    def test_niveaux(self):
        self.assertEqual(premiers_elements(constante(self.source, "NIVEAUX")), m.NIVEAUX)
