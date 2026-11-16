"""Contrôle de fidélité du référentiel transcrit par rapport aux guides PDF.

Usage (depuis backend/) :
    pip install -r requirements-dev.txt            # pypdf, outil de développement uniquement
    python manage.py verifier_referentiel --pdf-dir ..

Pour chaque guide de core/data/referentiel/, le PDF indiqué par `guide.source_fichier` est lu ; chaque champ
transcrit (compétence, critères, paliers, OA, OS, contenus, situations) doit avoir tous ses mots présents dans le
texte des pages citées. Code de sortie 1 s'il reste des écarts : rien n'entre dans l'application sans être vérifié.
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

from core import referentiel as R


class Command(BaseCommand):
    help = "Vérifie que le référentiel transcrit correspond mot pour mot aux guides PDF (pages citées)."

    def add_arguments(self, p):
        p.add_argument("--pdf-dir", default="..", help="Dossier contenant les guides PDF (défaut : racine du projet).")
        p.add_argument("--marge", type=int, default=1, help="Pages voisines tolérées (tableaux à cheval). Défaut : 1.")

    def handle(self, *a, pdf_dir, marge, **o):
        try:
            from pypdf import PdfReader
        except ImportError:
            raise CommandError("pypdf est requis : pip install -r requirements-dev.txt")
        R.guides.cache_clear()
        total = 0
        for g in R.guides():
            meta = g["guide"]
            erreurs = R.valider_structure(g)
            for e in erreurs:
                self.stderr.write(f"[structure] {meta['id']} : {e}")
            pdf = Path(pdf_dir) / meta["source_fichier"]
            if not pdf.exists():
                raise CommandError(f"PDF introuvable : {pdf}")
            pages = {i: (pg.extract_text() or "") for i, pg in enumerate(PdfReader(str(pdf)).pages, 1)}
            ecarts = R.verifier_fidelite(g, pages, marge=marge)
            for lieu, champ, absents in ecarts:
                self.stderr.write(f"[fidélité] {meta['id']} · {lieu} · {champ} : mots absents du guide {absents}")
            nb = sum(1 for _ in R.parcourir([g]))
            etat = self.style.SUCCESS("OK") if not (erreurs or ecarts) else self.style.ERROR(f"{len(erreurs) + len(ecarts)} écart(s)")
            self.stdout.write(f"{meta['id']} : {len(g['activites'])} activité(s), {nb} séance(s) — {etat}")
            total += len(erreurs) + len(ecarts)
        if total:
            raise CommandError(f"{total} écart(s) : corrigez la transcription avant de l'intégrer.")
        self.stdout.write(self.style.SUCCESS("Référentiel fidèle aux guides."))
