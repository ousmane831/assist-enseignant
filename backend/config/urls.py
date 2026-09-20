from django.contrib import admin
from django.urls import include, path
from rest_framework.authtoken.views import obtain_auth_token
from core.views import router, me, parametres
urlpatterns = [path("admin/", admin.site.urls), path("api/login/", obtain_auth_token),
    path("api/me/", me), path("api/parametres/", parametres), path("api/", include(router.urls))]
