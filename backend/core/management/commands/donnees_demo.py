from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from core import models as m


class Command(BaseCommand):
    help = "Crée un compte de démonstration avec une classe et 10 élèves FICTIFS (aucune donnée réelle)."

    def add_arguments(self, p):
        p.add_argument("--username", default="demo")
        p.add_argument("--password", required=True)

    @transaction.atomic
    def handle(self, *a, username, password, **o):
        U = get_user_model()
        if m.Classe.objects.filter(user__username=username).exists():
            raise CommandError("Des données existent déjà pour ce compte : rien n'a été modifié.")
        user, created = U.objects.get_or_create(username=username)
        if created:
            user.set_password(password); user.save()
        cl = m.Classe.objects.create(user=user, niveau="CE2", nom="A (démo)", annee_scolaire="2025/2026")
        els = [m.Eleve.objects.create(classe=cl, prenom="Élève", nom=str(i)) for i in range(1, 11)]
        for titre, mat, coef, f in [("Évaluation de grammaire (démo)", "Français", 1, lambda i: (i * 7 + 5) % 15 + 5),
                                    ("Devoir de calcul (démo)", "Mathématiques", 2, lambda i: (i * 11 + 3) % 13 + 6)]:
            ev = m.Evaluation.objects.create(classe=cl, matiere=mat, type="Devoir", periode="1er trimestre", titre=titre, note_max=20, coefficient=coef)
            for i, e in enumerate(els, 1):
                m.Note.objects.create(evaluation=ev, eleve=e, valeur=f(i))
        self.stdout.write(self.style.SUCCESS(f"Compte « {username} » : classe CE2 A (démo), 10 élèves fictifs, 2 évaluations."))
