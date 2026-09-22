import re
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

TELEPHONE_SN = re.compile(r"^(?:221|00221|\+221)?(3\d{8}|7\d{8})$")  # fixe (33…) et mobile (7x…) du Sénégal

class DemandeCompteS(serializers.ModelSerializer):
    """Dépôt public d'une demande de compte : statut et date imposés par le serveur (jamais par le client)."""
    # Saisie libre (espaces, +221, 00221…) : la normalisation faite dans validate_telephone ramène la valeur
    # à 13 caractères maximum. La limite du modèle (16) ne doit donc pas s'appliquer au texte brut saisi.
    telephone = serializers.CharField(max_length=30, validators=[])

    class Meta: model = m.DemandeCompte; fields = "__all__"; read_only_fields = ["statut", "created_at"]

    def validate_telephone(self, v):
        n = re.sub(r"[\s.\-()/]", "", str(v))
        if not TELEPHONE_SN.match(n):
            raise serializers.ValidationError("Numéro invalide : indiquez un numéro sénégalais à 9 chiffres (ex. 77 123 45 67).")
        return "+221" + n[-9:]

    def validate(self, d):
        for k in ("nom_complet", "ia", "ief", "numero_piece"):  # champs texte : ni espaces superflus, ni valeurs vides déguisées
            if k in d:
                d[k] = str(d[k]).strip()[:120]
                if not d[k]:
                    raise serializers.ValidationError({k: "Ce champ est obligatoire."})
        if "email" in d: d["email"] = str(d["email"]).strip()
        if d.get("telephone") and m.DemandeCompte.objects.filter(telephone=d["telephone"], statut="nouvelle").exists():
            raise serializers.ValidationError({"telephone": "Une demande est déjà enregistrée pour ce numéro : elle sera traitée par l'administrateur."})
        return d


class DemandeCompteAdminS(serializers.ModelSerializer):
    """Vue administrateur : les informations déclarées ne sont PAS modifiables (preuve de la demande) ;
    seuls la suite donnée (statut, note) peuvent être renseignées, et le suivi de traitement est imposé par le serveur."""
    traite_par = serializers.CharField(source="traite_par.username", read_only=True, default=None)
    class Meta:
        model = m.DemandeCompte
        fields = "__all__"
        read_only_fields = ["nom_complet", "telephone", "email", "region", "ia", "ief", "type_piece", "numero_piece",
                            "created_at", "traite_le", "traite_par", "compte_cree"]
    def validate_note(self, v): return str(v).strip()[:2000]
