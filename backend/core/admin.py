from django.contrib import admin
from django.utils import timezone
from . import models
for mod in (models.Classe, models.Eleve, models.Fiche, models.Evaluation, models.Parametres, models.Profil): admin.site.register(mod)


@admin.register(models.DemandeCompte)
class DemandeCompteAdmin(admin.ModelAdmin):
    """Vérifier la pièce d'identité déclarée, puis créer le compte à la main (aucun compte automatique).
    Mêmes règles que l'API d'administration (DemandesCompteAdminV) : les informations déclarées sont une preuve
    et restent en lecture seule ; tout traitement est horodaté et attribué à l'administrateur qui l'effectue."""
    list_display = ("nom_complet", "telephone", "email", "region", "ia", "ief", "type_piece", "numero_piece", "statut", "created_at", "traite_par")
    list_filter = ("statut", "region", "type_piece")
    search_fields = ("nom_complet", "telephone", "email", "ia", "ief", "numero_piece")
    readonly_fields = ("nom_complet", "telephone", "email", "region", "ia", "ief", "type_piece", "numero_piece",
                       "created_at", "traite_le", "traite_par", "compte_cree")
    actions = ("marquer_traitee", "marquer_rejetee")

    def has_add_permission(self, request):  # une demande se dépose depuis l'écran de connexion, pas ici
        return False

    def save_model(self, request, obj, form, change):
        if change:
            obj.traite_le, obj.traite_par = timezone.now(), request.user
        super().save_model(request, obj, form, change)

    def _marquer(self, request, queryset, statut):
        n = queryset.update(statut=statut, traite_le=timezone.now(), traite_par=request.user)
        self.message_user(request, f"{n} demande(s) mise(s) à jour.")

    @admin.action(description="Marquer comme traitée (compte créé)")
    def marquer_traitee(self, request, queryset): self._marquer(request, queryset, "traitee")

    @admin.action(description="Marquer comme rejetée")
    def marquer_rejetee(self, request, queryset): self._marquer(request, queryset, "rejetee")
