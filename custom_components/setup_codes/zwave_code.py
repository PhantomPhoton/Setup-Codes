"""Z-Wave DSK / SmartStart QR checks."""

from __future__ import annotations

from .matter_code import SetupCodeError

_DSK_GROUPS = 8
_DSK_GROUP_LEN = 5
_DSK_DIGITS = _DSK_GROUPS * _DSK_GROUP_LEN
_DSK_GROUP_MAX = 0xFFFF
_QR_PREFIX = "90"
_QR_MIN_LEN = 52


def canonicalize_dsk(raw: str) -> str | None:
    """Return canonical ``aaaaa-bbbbb-…`` DSK, or None if this is not a DSK."""
    digits = "".join(char for char in raw if char.isdigit())
    leftover = "".join(
        char
        for char in raw.strip()
        if not char.isdigit() and not char.isspace() and char not in "-."
    )
    if leftover or len(digits) != _DSK_DIGITS:
        return None
    groups = [
        digits[index : index + _DSK_GROUP_LEN]
        for index in range(0, _DSK_DIGITS, _DSK_GROUP_LEN)
    ]
    if any(int(group) > _DSK_GROUP_MAX for group in groups):
        return None
    return "-".join(groups)


def _store_qr_payload(raw: str) -> str:
    digits = "".join(char for char in raw if char.isdigit())
    leftover = "".join(
        char
        for char in raw.strip()
        if not char.isdigit() and not char.isspace() and char not in "-."
    )
    if leftover:
        raise SetupCodeError(
            "Z-Wave SmartStart QR codes are digits starting with 90 (spaces are OK)."
        )
    if not digits.startswith(_QR_PREFIX) or len(digits) < _QR_MIN_LEN:
        raise SetupCodeError(
            "Z-Wave SmartStart QR codes start with 90 and are at least 52 digits."
        )
    return digits


def validate_zwave_setup_code(raw: str) -> str:
    """Normalize a Z-Wave DSK or SmartStart QR payload for storage."""
    stripped = raw.strip()
    digits = "".join(char for char in stripped if char.isdigit())
    if digits.startswith(_QR_PREFIX) and len(digits) >= _QR_MIN_LEN:
        return _store_qr_payload(stripped)
    dsk = canonicalize_dsk(stripped)
    if dsk is None:
        raise SetupCodeError(
            "Z-Wave setup codes are a 40-digit DSK (8 groups of 5) or a 90… QR."
        )
    return dsk
