from django.contrib import admin
from . import models
for mod in (models.Classe, models.Eleve, models.Fiche, models.Evaluation, models.Parametres): admin.site.register(mod)
