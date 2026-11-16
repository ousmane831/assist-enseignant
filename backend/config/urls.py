from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from core.views import (router, me, parametres, profil, profil_photo, referentiel_pedagogique,
                        connexion, deconnexion, mot_de_passe)
urlpatterns = [path("admin/", admin.site.urls), path("api/login/", connexion),
    path("api/deconnexion/", deconnexion), path("api/mot-de-passe/", mot_de_passe),
    path("api/me/", me), path("api/parametres/", parametres), path("api/profil/", profil),
    path("api/profil/photo/", profil_photo), path("api/referentiel-pedagogique/", referentiel_pedagogique),
    path("api/", include(router.urls))]
# Photos de profil en développement uniquement (static() ne renvoie rien dès que DEBUG=0 : en production,
# c'est le serveur web qui sert MEDIA_ROOT en HTTPS, jamais Django).
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
