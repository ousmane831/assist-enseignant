from django.contrib import admin
from . import models
for mod in (models.Classe, models.Eleve, models.Fiche, models.Evaluation, models.Parametres): admin.site.register(mod)


@admin.register(models.DemandeCompte)
class DemandeCompteAdmin(admin.ModelAdmin):
    """Vérifier la pièce d'identité déclarée, puis créer le compte à la main (aucun compte automatique)."""
    list_display = ("nom_complet", "telephone", "email", "region", "ia", "ief", "type_piece", "numero_piece", "statut", "created_at")
    list_filter = ("statut", "region", "type_piece")
    search_fields = ("nom_complet", "telephone", "email", "ia", "ief", "numero_piece")
    readonly_fields = ("created_at",)
    actions = ("marquer_traitee", "marquer_rejetee")

    @admin.action(description="Marquer comme traitée (compte créé)")
    def marquer_traitee(self, request, queryset): queryset.update(statut="traitee")

    @admin.action(description="Marquer comme rejetée")
    def marquer_rejetee(self, request, queryset): queryset.update(statut="rejetee")
