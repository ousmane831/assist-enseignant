"""Authentification par token avec durée de vie limitée.

Les tokens DRF n'expirent jamais par défaut : un appareil perdu garderait l'accès indéfiniment.
Ici, un token plus vieux que TOKEN_DUREE_JOURS (settings, 30 jours par défaut) est refusé et supprimé ;
l'application affiche alors « session expirée » et l'enseignant se reconnecte (sa file hors connexion est conservée).
"""
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from rest_framework.exceptions import AuthenticationFailed


def limite_validite():
    """Date avant laquelle un token est considéré comme expiré."""
    return timezone.now() - timedelta(days=getattr(settings, "TOKEN_DUREE_JOURS", 30))


def token_valide(user):
    """Token utilisable pour `user` : un token expiré est remplacé par un nouveau."""
    Token.objects.filter(user=user, created__lt=limite_validite()).delete()
    return Token.objects.get_or_create(user=user)[0]


class TokenExpirable(TokenAuthentication):
    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token.created < limite_validite():
            token.delete()
            raise AuthenticationFailed("Session expirée : reconnectez-vous.")
        return user, token
