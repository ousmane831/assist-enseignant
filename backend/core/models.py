from decimal import Decimal
from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
U = settings.AUTH_USER_MODEL
NIVEAUX = ["CI", "CP", "CE1", "CE2", "CM1", "CM2"]
STATUTS = [("brouillon", "Brouillon"), ("verifie", "Vérifiée"), ("valide", "Validée")]

class Parametres(models.Model):
    """Règles et listes configurables (rien d'officiel n'est codé en dur)."""
    user = models.OneToOneField(U, on_delete=models.CASCADE)
    config = models.JSONField(default=dict)

class Classe(models.Model):
    user = models.ForeignKey(U, on_delete=models.CASCADE)
    niveau = models.CharField(max_length=3, choices=[(n, n) for n in NIVEAUX])
    nom = models.CharField(max_length=50)
    annee_scolaire = models.CharField(max_length=9, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

class Eleve(models.Model):
    classe = models.ForeignKey(Classe, related_name="eleves", on_delete=models.CASCADE)
    prenom = models.CharField(max_length=80)
    nom = models.CharField(max_length=80)
    class Meta: ordering = ["nom", "prenom"]
    def __str__(self): return f"{self.prenom} {self.nom}"

class Lecon(models.Model):
    user = models.ForeignKey(U, on_delete=models.CASCADE)
    niveau = models.CharField(max_length=3)
    matiere = models.CharField(max_length=80)
    domaine = models.CharField(max_length=80, blank=True)
    titre = models.CharField(max_length=200)

class Fiche(models.Model):
    user = models.ForeignKey(U, on_delete=models.CASCADE)
    niveau = models.CharField(max_length=3)
    matiere = models.CharField(max_length=80)
    domaine = models.CharField(max_length=80, blank=True)
    lecon = models.CharField(max_length=200)
    annee_scolaire = models.CharField(max_length=9, blank=True)
    sections = models.JSONField(default=list)  # [{titre, contenu}] : structure flexible
    version_precedente = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class Exercice(models.Model):
    fiche = models.ForeignKey(Fiche, related_name="exercices", on_delete=models.CASCADE)
    titre = models.CharField(max_length=200)
    contenu = models.TextField(blank=True)
    ordre = models.PositiveIntegerField(default=0)
    imprimer = models.BooleanField(default=True)
    class Meta: ordering = ["ordre", "id"]

class Evaluation(models.Model):
    classe = models.ForeignKey(Classe, related_name="evaluations", on_delete=models.CASCADE)
    matiere = models.CharField(max_length=80)
    type = models.CharField(max_length=80)
    periode = models.CharField(max_length=80)
    date = models.DateField(null=True, blank=True)
    titre = models.CharField(max_length=200)
    note_max = models.DecimalField(max_digits=6, decimal_places=2, default=20, validators=[MinValueValidator(Decimal("0.01"))])
    coefficient = models.DecimalField(max_digits=5, decimal_places=2, default=1, validators=[MinValueValidator(Decimal("0"))])
    statut = models.CharField(max_length=10, choices=STATUTS, default="brouillon")  # brouillon -> verifie -> valide
    valide_le = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

class Note(models.Model):
    evaluation = models.ForeignKey(Evaluation, related_name="notes", on_delete=models.CASCADE)
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE)
    valeur = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(Decimal("0"))])
    observation = models.CharField(max_length=255, blank=True)
    class Meta: unique_together = ("evaluation", "eleve")

class Appreciation(models.Model):
    eleve = models.ForeignKey(Eleve, on_delete=models.CASCADE)
    periode = models.CharField(max_length=80)
    texte = models.TextField(blank=True)
    validee = models.BooleanField(default=False)  # jamais définitive sans validation
    class Meta: unique_together = ("eleve", "periode")
