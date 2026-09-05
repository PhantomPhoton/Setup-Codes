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


def _store_xhm_payload(raw: str) -> str:
    # TODO: validate X-HM:// HAP setup payload and extract the 8-digit setup code.
    _prefix, _sep, rest = raw.strip().partition(":")
    return "X-HM://" + rest.lstrip("/").strip()


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
