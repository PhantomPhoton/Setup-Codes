"""Matter manual pairing-code checks (Core Spec §5.1.4)."""

from __future__ import annotations

from .const import PROTOCOL_HOMEKIT, PROTOCOL_MATTER, PROTOCOL_ZWAVE

# Dihedral D5 multiplication, permutation, and inverse tables (Verhoeff).
_D = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)
_P = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)

_INVALID_PASSCODES = frozenset(
    {
        0,
        11111111,
        22222222,
        33333333,
        44444444,
        55555555,
        66666666,
        77777777,
        88888888,
        99999999,
        12345678,
        87654321,
    }
)
_PASSCODE_MAX = 99999998


class SetupCodeError(ValueError):
    """User-facing setup-code validation failure. Message never includes the code."""


def verhoeff_valid(digits: str) -> bool:
    """Return True if ``digits`` (including the check digit) is a Verhoeff number."""
    checksum = 0
    for index, char in enumerate(reversed(digits)):
        checksum = _D[checksum][_P[index % 8][int(char)]]
    return checksum == 0


def _normalize_digits(raw: str) -> str:
    stripped = raw.strip()
    digits = "".join(char for char in stripped if char.isdigit())
    leftover = "".join(
        char
        for char in stripped
        if not char.isdigit() and not char.isspace() and char not in "-."
    )
    if leftover:
        raise SetupCodeError(
            "Matter manual pairing codes are 11 or 21 digits (spaces and dashes are OK)."
        )
    return digits


def _passcode_from_chunks(chunk1: int, chunk2: int, chunk3: int) -> int:
    bits = f"{chunk1:04b}{chunk2:016b}{chunk3:013b}"
    pincode_lsb = int(bits[6:20], 2)
    pincode_msb = int(bits[20:33], 2)
    return (pincode_msb << 14) | pincode_lsb


def validate_matter_manual_code(raw: str) -> str:
    """Normalize and validate a Matter manual pairing code.

    Returns the canonical digit string (no spaces or dashes).
    """
    digits = _normalize_digits(raw)
    length = len(digits)
    if length not in (11, 21):
        raise SetupCodeError("Matter manual pairing codes must be 11 or 21 digits.")
    if int(digits[0]) > 7:
        raise SetupCodeError("This is not a valid Matter manual pairing code.")
    vid_pid_present = bool(int(digits[0]) & 0b0100)
    if vid_pid_present and length != 21:
        raise SetupCodeError(
            "This code includes vendor/product IDs and must be 21 digits."
        )
    if not vid_pid_present and length != 11:
        raise SetupCodeError(
            "This code does not include vendor/product IDs and must be 11 digits."
        )
    if not verhoeff_valid(digits):
        raise SetupCodeError(
            "That pairing code failed the Verhoeff checksum (typo or incomplete code)."
        )
    chunk2 = int(digits[1:6])
    chunk3 = int(digits[6:10])
    if chunk2 > 0xFFFF or chunk3 > 0x1FFF:
        raise SetupCodeError("This is not a valid Matter manual pairing code.")
    if length == 21:
        chunk4 = int(digits[10:15])
        chunk5 = int(digits[15:20])
        if chunk4 > 0xFFFF or chunk5 > 0xFFFF:
            raise SetupCodeError("This is not a valid Matter manual pairing code.")
    passcode = _passcode_from_chunks(int(digits[0]), chunk2, chunk3)
    if passcode > _PASSCODE_MAX or passcode in _INVALID_PASSCODES:
        raise SetupCodeError("This is not a valid Matter manual pairing code.")
    return digits


def _store_mt_payload(raw: str) -> str:
    # TODO: validate MT: QR payload (CHIP base-38 + bit fields) and extract the
    # 11/21-digit manual pairing code (Verhoeff) from it.
    stripped = raw.strip()
    return "MT:" + stripped[3:].strip()


def normalize_setup_code(protocol: str, setup_code: str | None) -> str | None:
    """Validate and canonicalize a user-entered setup code for storage."""
    cleaned = (setup_code or "").strip() or None
    if cleaned is None:
        return None
    if protocol == PROTOCOL_MATTER:
        if cleaned.upper().startswith("MT:"):
            return _store_mt_payload(cleaned)
        return validate_matter_manual_code(cleaned)
    if protocol == PROTOCOL_HOMEKIT:
        from .homekit_code import validate_homekit_setup_code

        return validate_homekit_setup_code(cleaned)
    if protocol == PROTOCOL_ZWAVE:
        from .zwave_code import validate_zwave_setup_code

        return validate_zwave_setup_code(cleaned)
    return cleaned
