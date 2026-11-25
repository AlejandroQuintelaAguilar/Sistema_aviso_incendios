"""Utilidades geográficas para extracción de coordenadas, geocodificación inversa y distancias."""

import json
import math
import re
import unicodedata
import urllib.error
import urllib.request
from typing import Any

from flask import current_app, has_app_context

from app.middleware.error_handler import ValidationError

_COORD_PATTERN = re.compile(r"(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)")
_COORD_SUFFIX_PATTERN = re.compile(
    r"\s*\(\s*(?:Coord|GPS)?\s*:?\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)",
    re.IGNORECASE,
)
_COORD_INLINE_PATTERN = re.compile(
    r"\b(?:Coord|GPS)\s*:\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?",
    re.IGNORECASE,
)

# Caché en memoria por coordenada redondeada a ~110 m (3 decimales)
_REVERSE_GEO_CACHE: dict[tuple[float, float], str | None] = {}

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


def extract_explicit_coordinates(text: str | None) -> dict[str, float] | None:
    """Extrae únicamente pares lat/lng explícitos presentes en el texto."""
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


def _extract_explicit_coordinates(text: str | None) -> dict[str, float] | None:
    return extract_explicit_coordinates(text)


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


def limpiar_cache_reverse_geocode() -> None:
    """Limpia la caché en memoria de geocodificación inversa."""
    _REVERSE_GEO_CACHE.clear()


def strip_coordinates_label(ubicacion: str | None) -> str:
    """Devuelve el texto de ubicación sin el sufijo técnico (Coord: lat, lng)."""
    if not ubicacion or not isinstance(ubicacion, str):
        return ""
    limpio = _COORD_SUFFIX_PATTERN.sub("", ubicacion)
    limpio = _COORD_INLINE_PATTERN.sub("", limpio)
    limpio = re.sub(r"\s*[—–-]\s*$", "", limpio)
    limpio = re.sub(r"\s{2,}", " ", limpio).strip()
    return limpio or ubicacion.strip()


def _first_present(address: dict[str, Any], keys: tuple[str, ...]) -> str | None:
    for key in keys:
        val = address.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _consultar_nominatim_json(
    lat: float, lng: float, timeout_sec: float = 2.5
) -> dict[str, Any] | None:
    url = (
        "https://nominatim.openstreetmap.org/reverse"
        f"?format=jsonv2&lat={lat:.5f}&lon={lng:.5f}&zoom=17&addressdetails=1&accept-language=es"
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "VigiaTerritorial-CAD/1.0 (emergencias-bolivia)"},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    data = json.loads(raw)
    return data if isinstance(data, dict) else None


def _formatear_direccion_nominatim(payload: dict[str, Any] | None) -> str | None:
    if not isinstance(payload, dict):
        return None
    address = payload.get("address")
    partes: list[str] = []
    vistas: set[str] = set()

    if isinstance(address, dict):
        via = _first_present(
            address,
            (
                "road",
                "pedestrian",
                "residential",
                "footway",
                "path",
                "hamlet",
                "isolated_dwelling",
            ),
        )
        zona = _first_present(
            address,
            (
                "neighbourhood",
                "suburb",
                "quarter",
                "city_district",
                "village",
                "town",
            ),
        )
        ciudad = _first_present(address, ("city", "municipality", "county", "state"))
        candidatos = [via, zona, ciudad]
        if not via and not zona and isinstance(address.get("state"), str):
            candidatos.append(address.get("state"))

        for cand in candidatos:
            if not cand:
                continue
            norm = _normalize_text(cand.strip())
            if norm and norm not in vistas:
                vistas.add(norm)
                partes.append(cand.strip())

    if partes:
        return ", ".join(partes)

    display_name = payload.get("display_name")
    if isinstance(display_name, str) and display_name.strip():
        segs = [s.strip() for s in display_name.split(",") if s.strip()]
        if segs:
            return ", ".join(segs[:3])
    return None


def reverse_geocode_ubicacion(
    lat: float,
    lng: float,
    timeout_sec: float = 2.5,
    allow_in_testing: bool = False,
) -> str | None:
    """Convierte lat/lng a calle, barrio y municipio usando OpenStreetMap Nominatim con caché."""
    if not allow_in_testing and has_app_context() and current_app.config.get("TESTING"):
        return None

    cache_key = (round(float(lat), 3), round(float(lng), 3))
    if cache_key in _REVERSE_GEO_CACHE:
        return _REVERSE_GEO_CACHE[cache_key]

    direccion: str | None = None
    try:
        payload = _consultar_nominatim_json(float(lat), float(lng), timeout_sec=timeout_sec)
        direccion = _formatear_direccion_nominatim(payload)
    except (urllib.error.URLError, TimeoutError, ValueError, OSError):
        direccion = None

    _REVERSE_GEO_CACHE[cache_key] = direccion
    return direccion
