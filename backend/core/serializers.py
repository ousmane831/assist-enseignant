from rest_framework import serializers
from . import models as m
def mk(model, **extra):
    meta = type("Meta", (), {"model": model, "fields": "__all__", **extra})
    return type(model.__name__ + "S", (serializers.ModelSerializer,), {"Meta": meta})
ClasseS = mk(m.Classe, read_only_fields=["user"]); EleveS = mk(m.Eleve); LeconS = mk(m.Lecon, read_only_fields=["user"])
ExerciceS = mk(m.Exercice); EvaluationS = mk(m.Evaluation, read_only_fields=["statut", "valide_le"])
class FicheS(serializers.ModelSerializer):
    exercices = ExerciceS(many=True, read_only=True)
    class Meta: model = m.Fiche; fields = "__all__"; read_only_fields = ["user", "version_precedente"]
