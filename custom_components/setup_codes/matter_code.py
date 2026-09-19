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
_INV = (0, 4, 3, 2, 1, 5, 6, 7, 8, 9)

# CHIP Base38: 0-9 A-Z - .  (Setup Payload QR, Core Spec §5.1.3)
_BASE38_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-."
_BASE38_DECODE = {char: index for index, char in enumerate(_BASE38_ALPHABET)}
_QR_VERSION_BITS = 3
_QR_VENDOR_ID_BITS = 16
_QR_PRODUCT_ID_BITS = 16
_QR_FLOW_BITS = 2
_QR_DISCOVERY_BITS = 8
_QR_DISCRIMINATOR_BITS = 12
_QR_PASSCODE_BITS = 27
_QR_PADDING_BITS = 4
_QR_FIXED_BYTES = 11

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


def verhoeff_check_digit(digits: str) -> str:
    """Return the Verhoeff check digit for ``digits`` (payload without the check)."""
    checksum = 0
    for index, char in enumerate(reversed(digits + "0")):
        checksum = _D[checksum][_P[index % 8][int(char)]]
    return str(_INV[checksum])


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


def _base38_decode(encoded: str) -> bytes | None:
    """Decode a CHIP Base38 QR body. Returns None if the string is not valid."""
    payload = encoded.upper()
    if not payload:
        return None
    out = bytearray()
    index = 0
    length = len(payload)
    while index < length:
        remaining = length - index
        if remaining >= 5:
            chars, nbytes = 5, 3
        elif remaining == 4:
            chars, nbytes = 4, 2
        elif remaining == 2:
            chars, nbytes = 2, 1
        else:
            return None
        value = 0
        for offset in range(chars, 0, -1):
            char = payload[index + offset - 1]
            digit = _BASE38_DECODE.get(char)
            if digit is None:
                return None
            value = value * 38 + digit
        index += chars
        for _ in range(nbytes):
            out.append(value & 0xFF)
            value >>= 8
        if value:
            return None
    return bytes(out)


def _read_bits(data: bytes, start: int, length: int) -> int:
    value = 0
    for bit in range(length):
        position = start + bit
        byte_index = position // 8
        if byte_index >= len(data):
            return value
        if data[byte_index] & (1 << (position % 8)):
            value |= 1 << bit
    return value


def parse_mt_payload(raw: str) -> dict[str, int] | None:
    """Parse an ``MT:`` QR into CHIP onboarding fields, or None if invalid."""
    stripped = (raw or "").strip()
    if not stripped.upper().startswith("MT:"):
        return None
    encoded = stripped[3:].strip().split("*", 1)[0].strip()
    if "%" in encoded:
        encoded = encoded.split("%", 1)[0].strip()
    data = _base38_decode(encoded)
    if data is None or len(data) < _QR_FIXED_BYTES:
        return None
    offset = 0
    version = _read_bits(data, offset, _QR_VERSION_BITS)
    offset += _QR_VERSION_BITS
    vendor_id = _read_bits(data, offset, _QR_VENDOR_ID_BITS)
    offset += _QR_VENDOR_ID_BITS
    product_id = _read_bits(data, offset, _QR_PRODUCT_ID_BITS)
    offset += _QR_PRODUCT_ID_BITS
    flow = _read_bits(data, offset, _QR_FLOW_BITS)
    offset += _QR_FLOW_BITS
    offset += _QR_DISCOVERY_BITS
    discriminator = _read_bits(data, offset, _QR_DISCRIMINATOR_BITS)
    offset += _QR_DISCRIMINATOR_BITS
    passcode = _read_bits(data, offset, _QR_PASSCODE_BITS)
    offset += _QR_PASSCODE_BITS
    padding = _read_bits(data, offset, _QR_PADDING_BITS)
    if version != 0 or padding != 0:
        return None
    if passcode > _PASSCODE_MAX or passcode in _INVALID_PASSCODES:
        return None
    return {
        "vendor_id": vendor_id,
        "product_id": product_id,
        "flow": flow,
        "discriminator": discriminator,
        "passcode": passcode,
    }


def encode_manual_pairing_code(
    discriminator: int,
    passcode: int,
    *,
    vendor_id: int | None = None,
    product_id: int | None = None,
) -> str:
    """Build an 11- or 21-digit Matter manual pairing code (Core Spec §5.1.4)."""
    include_ids = vendor_id is not None and product_id is not None
    chunk1 = (discriminator >> 10) | (4 if include_ids else 0)
    chunk2 = ((discriminator & 0x300) << 6) | (passcode & 0x3FFF)
    chunk3 = passcode >> 14
    payload = f"{chunk1}{chunk2:05d}{chunk3:04d}"
    if include_ids:
        payload += f"{vendor_id:05d}{product_id:05d}"
    return payload + verhoeff_check_digit(payload)


def short_manual_pairing_code_from_digits(digits: str) -> str | None:
    """Return the 11-digit code typed at pairing, from an 11- or 21-digit string."""
    if len(digits) == 11:
        try:
            return validate_matter_manual_code(digits)
        except SetupCodeError:
            return None
    if len(digits) != 21:
        return None
    try:
        validate_matter_manual_code(digits)
    except SetupCodeError:
        return None
    payload = f"{int(digits[0]) & 0b0011}{digits[1:10]}"
    try:
        return validate_matter_manual_code(payload + verhoeff_check_digit(payload))
    except SetupCodeError:
        return None


def manual_pairing_code_from_mt(raw: str) -> str | None:
    """Return the 11-digit manual pairing code encoded in an ``MT:`` QR."""
    parsed = parse_mt_payload(raw)
    if parsed is None:
        return None
    digits = encode_manual_pairing_code(parsed["discriminator"], parsed["passcode"])
    try:
        return validate_matter_manual_code(digits)
    except SetupCodeError:
        return None


def _store_mt_payload(raw: str) -> str:
    stripped = raw.strip()
    stored = "MT:" + stripped[3:].strip()
    if manual_pairing_code_from_mt(stored) is None:
        raise SetupCodeError("This is not a valid Matter MT: QR payload.")
    return stored


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
