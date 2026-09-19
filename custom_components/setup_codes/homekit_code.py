"""HomeKit setup-code checks (HAP setup code / setup payload)."""

from __future__ import annotations

from .matter_code import SetupCodeError

_INVALID_SETUP_CODES = frozenset(
    {
        "00000000",
        "11111111",
        "22222222",
        "33333333",
        "44444444",
        "55555555",
        "66666666",
        "77777777",
        "88888888",
        "99999999",
        "12345678",
        "87654321",
    }
)

# HAP setup payload: X-HM:// + 9 base-36 chars + 4-char Setup ID
_BASE36_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
_BASE36_DECODE = {char: index for index, char in enumerate(_BASE36_ALPHABET)}
_PAYLOAD_LEN = 9
_SETUP_ID_LEN = 4
_SETUP_CODE_BITS = 27
_SETUP_CODE_MASK = (1 << _SETUP_CODE_BITS) - 1
_SETUP_CODE_MAX = 99999999


def parse_xhm_payload(raw: str) -> dict[str, str | int] | None:
    """Parse an ``X-HM://`` QR into HAP setup fields, or None if invalid."""
    stripped = (raw or "").strip()
    if not stripped.upper().startswith("X-HM:"):
        return None
    _prefix, _sep, rest = stripped.partition(":")
    rest = rest.lstrip("/").strip()
    if len(rest) != _PAYLOAD_LEN + _SETUP_ID_LEN:
        return None
    encoded = rest[:_PAYLOAD_LEN].upper()
    setup_id = rest[_PAYLOAD_LEN:]
    if any(char not in _BASE36_DECODE for char in encoded):
        return None
    if not setup_id.isalnum():
        return None
    value = 0
    for char in encoded:
        value = value * 36 + _BASE36_DECODE[char]
    version = (value >> 43) & 0x7
    reserved = (value >> 39) & 0xF
    bit30 = (value >> 30) & 1
    if version != 0 or reserved != 0 or bit30 != 0:
        return None
    code_int = value & _SETUP_CODE_MASK
    if code_int > _SETUP_CODE_MAX:
        return None
    digits = f"{code_int:08d}"
    if digits in _INVALID_SETUP_CODES:
        return None
    return {
        "setup_code": digits,
        "setup_id": setup_id,
        "category": (value >> 31) & 0xFF,
        "stored": f"X-HM://{encoded}{setup_id}",
    }


def setup_code_from_xhm(raw: str) -> str | None:
    """Return the 8-digit HAP setup code encoded in an ``X-HM://`` QR."""
    parsed = parse_xhm_payload(raw)
    if parsed is None:
        return None
    return str(parsed["setup_code"])


def _store_xhm_payload(raw: str) -> str:
    parsed = parse_xhm_payload(raw)
    if parsed is None:
        raise SetupCodeError("This is not a valid HomeKit X-HM:// QR payload.")
    return str(parsed["stored"])


def validate_homekit_setup_code(raw: str) -> str:
    """Normalize and validate a HomeKit setup code or QR payload.

    Returns canonical 8 digits, or an ``X-HM://`` payload stored as-is.
    """
    stripped = raw.strip()
    if stripped.upper().startswith("X-HM:"):
        return _store_xhm_payload(stripped)
    leftover = "".join(
        char
        for char in stripped
        if not char.isdigit() and not char.isspace() and char not in "-."
    )
    if leftover:
        raise SetupCodeError(
            "HomeKit setup codes are 8 digits (XXX-XX-XXX) or an X-HM:// payload."
        )
    digits = "".join(char for char in stripped if char.isdigit())
    if len(digits) != 8:
        raise SetupCodeError("HomeKit setup codes must be 8 digits.")
    if digits in _INVALID_SETUP_CODES:
        raise SetupCodeError("This is not a valid HomeKit setup code.")
    return digits
