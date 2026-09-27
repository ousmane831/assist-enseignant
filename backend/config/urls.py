from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from core.views import router, me, parametres, profil, profil_photo
urlpatterns = [path("admin/", admin.site.urls), path("api/login/", obtain_auth_token),
    path("api/me/", me), path("api/parametres/", parametres), path("api/profil/", profil),
    path("api/profil/photo/", profil_photo), path("api/", include(router.urls))]
# Photos de profil en développement uniquement (static() ne renvoie rien dès que DEBUG=0 : en production,
# c'est le serveur web qui sert MEDIA_ROOT en HTTPS, jamais Django).
urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
