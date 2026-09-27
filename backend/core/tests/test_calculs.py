import unittest
from decimal import Decimal
from core import calculs as C


class LireNote(unittest.TestCase):
    def test_valide(self): self.assertEqual(C.lire_note("15", 20), Decimal("15"))
    def test_virgule_decimale(self): self.assertEqual(C.lire_note("12,5", 20), Decimal("12.5"))
    def test_arrondi_deux_decimales(self): self.assertEqual(C.lire_note("12.345", 20), Decimal("12.35"))
    def test_manquante(self):
        for v in (None, "", "   "): self.assertIsNone(C.lire_note(v, 20))
    def test_maximum_accepte(self): self.assertEqual(C.lire_note("20", 20), Decimal("20"))
    def test_negative_refusee(self): self.assertRaises(ValueError, C.lire_note, "-1", 20)
    def test_superieure_au_maximum(self): self.assertRaises(ValueError, C.lire_note, "21", 20)
    def test_note_max_differente(self): self.assertRaises(ValueError, C.lire_note, "11", 10)
    def test_valeurs_invalides(self):
        for v in ("abc", "nan", "inf", "1e999999"): self.assertRaises(ValueError, C.lire_note, v, 20)


class Moyennes(unittest.TestCase):
    def test_dix_sur_vingt(self): self.assertEqual(C.moyenne_ponderee([(10, 20, 1)]), 10.0)
    def test_plusieurs_notes(self): self.assertEqual(C.moyenne_ponderee([(10, 20, 1), (14, 20, 1)]), 12.0)
    def test_coefficient(self): self.assertEqual(C.moyenne_ponderee([(10, 20, 1), (16, 20, 2)]), 14.0)
    def test_note_max_differente(self): self.assertEqual(C.moyenne_ponderee([(8, 10, 1)]), 16.0)
    def test_maxima_mixtes(self): self.assertEqual(C.moyenne_ponderee([(5, 10, 1), (10, 20, 1)]), 10.0)
    def test_base_configurable(self): self.assertEqual(C.moyenne_ponderee([(10, 20, 1)], base=10), 5.0)
    def test_decimaux(self): self.assertEqual(C.moyenne_ponderee([(Decimal("7.5"), Decimal("10"), Decimal("1"))]), 15.0)
    def test_arrondi(self): self.assertEqual(C.moyenne_ponderee([(10, 20, 1), (10, 20, 1), (11, 20, 1)]), 10.33)
    def test_eleve_sans_evaluation(self): self.assertIsNone(C.moyenne_ponderee([]))
    def test_coefficients_nuls(self): self.assertIsNone(C.moyenne_ponderee([(10, 20, 0)]))
    def test_note_max_nulle_ignoree(self): self.assertIsNone(C.moyenne_ponderee([(10, 0, 1)]))
    def test_generale(self): self.assertEqual(C.moyenne_generale([10, None, 14]), 12.0)
    def test_generale_vide(self):
        self.assertIsNone(C.moyenne_generale([])); self.assertIsNone(C.moyenne_generale([None]))


class Classement(unittest.TestCase):
    def test_simple(self): self.assertEqual(C.rangs({1: 15, 2: 12, 3: 17}), {3: 1, 1: 2, 2: 3})
    def test_egalite(self): self.assertEqual(C.rangs({1: 12, 2: 12, 3: 10}), {1: 1, 2: 1, 3: 3})
    def test_sans_note_exclu(self): self.assertEqual(C.rangs({1: None, 2: 10}), {2: 1})
    def test_repartition(self): self.assertEqual(C.repartition([0, 5, 10, 20], 20), [1, 1, 1, 1])


class AppreciationAutomatique(unittest.TestCase):
    """Remplissage automatique de l'appréciation : texte du seuil le plus élevé atteint par la moyenne."""
    S = [{"min": 0, "texte": "Besoin d'accompagnement"}, {"min": 0.4, "texte": "Résultats à surveiller"},
         {"min": 0.5, "texte": "Résultats satisfaisants"}, {"min": 0.7, "texte": "Bons résultats"}]

    def test_sans_note_aucune_appreciation(self): self.assertIsNone(C.appreciation_auto(None, 20, self.S))

    def test_seuil_le_plus_eleve_atteint(self):
        for note, attendu in ((2, "Besoin d'accompagnement"), (9, "Résultats à surveiller"),
                              (12, "Résultats satisfaisants"), (18, "Bons résultats")):
            self.assertEqual(C.appreciation_auto(note, 20, self.S), attendu, note)

    def test_seuil_atteint_exactement(self):
        self.assertEqual(C.appreciation_auto(10, 20, self.S), "Résultats satisfaisants")
        self.assertEqual(C.appreciation_auto(14, 20, self.S), "Bons résultats")

    def test_base_configurable(self): self.assertEqual(C.appreciation_auto(7, 10, self.S), "Bons résultats")

    def test_moyenne_decimale(self): self.assertEqual(C.appreciation_auto(Decimal("13.5"), Decimal("20"), self.S), "Résultats satisfaisants")

    def test_seuils_desordonnes(self): self.assertEqual(C.appreciation_auto(18, 20, list(reversed(self.S))), "Bons résultats")

    def test_aucun_seuil_configure(self):
        self.assertEqual(C.appreciation_auto(18, 20, []), ""); self.assertEqual(C.appreciation_auto(18, 20, None), "")

    def test_seuil_sans_texte_ignore(self):
        self.assertEqual(C.appreciation_auto(18, 20, [{"min": 0.5}]), "")
        self.assertEqual(C.appreciation_auto(2, 20, [{"min": 0.5, "texte": "Bien"}]), "")

    def test_base_invalide(self): self.assertEqual(C.appreciation_auto(18, 0, self.S), "")


if __name__ == "__main__":
    unittest.main()

