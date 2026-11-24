"""Utilidades geográficas para extracción de coordenadas y cálculo de distancias."""

import math
import re
import unicodedata
from typing import Any

from app.middleware.error_handler import ValidationError

_COORD_PATTERN = re.compile(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)")

# Coordenadas de referencia para sectores semilla cuando el texto no trae lat, lng
_SECTOR_COORDS: tuple[tuple[str, dict[str, float]], ...] = (
    ("tunari", {"lat": -17.3125, "lng": -66.1842}),
    ("san pedro", {"lat": -17.3833, "lng": -66.1450}),
    ("valle alto", {"lat": -17.5241, "lng": -65.9812}),
    ("cordillera", {"lat": -17.5241, "lng": -65.9812}),
    ("serrania", {"lat": -17.2054, "lng": -66.3011}),
    ("valle norte", {"lat": -17.3350, "lng": -66.1550}),
    ("calacoto", {"lat": -17.3895, "lng": -66.1568}),
    ("miraflores", {"lat": -17.3895, "lng": -66.1568}),
    ("las palmas", {"lat": -17.3895, "lng": -66.1568}),
    ("cercado", {"lat": -17.3895, "lng": -66.1568}),
    ("circunvalacion", {"lat": -17.3720, "lng": -66.1560}),
    ("estacion central", {"lat": -17.3720, "lng": -66.1560}),
    ("carretera al norte", {"lat": -17.3195, "lng": -66.1650}),
    ("sub-estacion", {"lat": -17.3195, "lng": -66.1650}),
)


def _normalize_text(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    ascii_text = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return ascii_text.lower()


def _extract_explicit_coordinates(text: str | None) -> dict[str, float] | None:
    if not text or not isinstance(text, str):
        return None
    for match in _COORD_PATTERN.finditer(text):
        try:
            lat_f = float(match.group(1))
            lng_f = float(match.group(2))
        except ValueError:
            continue
        if -90.0 <= lat_f <= 90.0 and -180.0 <= lng_f <= 180.0:
            if "." in match.group(1) or "." in match.group(2):
                return {"lat": lat_f, "lng": lng_f}
    return None


def validate_coordinates(lat: Any, lng: Any) -> tuple[float, float]:
    """Valida que latitud y longitud sean numéricas y estén dentro de rango geográfico."""
    if isinstance(lat, bool) or isinstance(lng, bool):
        raise ValidationError("Las coordenadas 'lat' y 'lng' deben ser numéricas")
    try:
        lat_f = float(lat)
        lng_f = float(lng)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Las coordenadas 'lat' y 'lng' deben ser numéricas") from exc

    if not (-90.0 <= lat_f <= 90.0) or not (-180.0 <= lng_f <= 180.0):
        raise ValidationError(
            "Coordenadas fuera de rango válido (lat: [-90, 90], lng: [-180, 180])"
        )
    return lat_f, lng_f


def extract_coordinates(text: str | None) -> dict[str, float] | None:
    """Extrae lat/lng explícitos del texto o geocodifica sectores conocidos de referencia."""
    explicit = _extract_explicit_coordinates(text)
    if explicit is not None:
        return explicit

    if not text or not isinstance(text, str):
        return None
    normalized = _normalize_text(text)
    for keyword, coords in _SECTOR_COORDS:
        if keyword in normalized:
            return dict(coords)
    return None


def format_ubicacion_con_coordenadas(
    ubicacion: str, lat: Any = None, lng: Any = None
) -> str:
    """Anexa (Coord: lat, lng) si se proveen coordenadas explícitas y el texto no las incluye."""
    base = ubicacion.strip()
    if lat is None and lng is None:
        return base
    if lat is None or lng is None:
        raise ValidationError("Debe proporcionar tanto 'lat' como 'lng'")

    lat_f, lng_f = validate_coordinates(lat, lng)
    if _extract_explicit_coordinates(base) is not None:
        return base
    return f"{base} (Coord: {lat_f:.4f}, {lng_f:.4f})"


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calcula la distancia geodésica en kilómetros entre dos puntos usando Haversine."""
    earth_radius_km = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return earth_radius_km * c


def estimar_eta_min(
    distancia_km: float, velocidad_kmh: float = 35.0, alistamiento_min: int = 3
) -> int:
    """Estima el tiempo de arribo en minutos considerando velocidad operativa y alistamiento."""
    if distancia_km <= 0 or velocidad_kmh <= 0:
        return max(3, alistamiento_min)
    return max(3, round((distancia_km / velocidad_kmh) * 60 + alistamiento_min))
