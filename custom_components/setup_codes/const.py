"""Constants for Setup Codes."""

from typing import Final

DOMAIN: Final = "setup_codes"
VERSION: Final = "0.1.38"

STORAGE_KEY: Final = DOMAIN
STORAGE_VERSION: Final = 1

PROTOCOL_MATTER: Final = "matter"
PROTOCOL_HOMEKIT: Final = "homekit"
PROTOCOL_ZWAVE: Final = "zwave"

ENABLED_PROTOCOLS: Final = (PROTOCOL_MATTER, PROTOCOL_HOMEKIT, PROTOCOL_ZWAVE)

PROTOCOL_LABELS: Final = {
    PROTOCOL_MATTER: "Matter",
    PROTOCOL_HOMEKIT: "HomeKit",
    PROTOCOL_ZWAVE: "Z-Wave",
}

MATTER_DOMAIN: Final = "matter"
ZWAVE_JS_DOMAIN: Final = "zwave_js"
HOMEKIT_CONTROLLER_DOMAIN: Final = "homekit_controller"
HOMEKIT_ACCESSORY_ID_KEY: Final = f"{HOMEKIT_CONTROLLER_DOMAIN}:accessory-id"
HOMEKIT_LEGACY_ACCESSORY_ID_KEY: Final = "accessory-id"
MATTER_DEVICE_ID_PREFIX: Final = "deviceid_"
ZWAVE_PROVISION_ID_PREFIX: Final = "provision_"

# homekit_controller uses typed identifier keys, not (DOMAIN, unique_id).
HOMEKIT_IDENTIFIER_DOMAINS: Final = frozenset(
    {
        HOMEKIT_CONTROLLER_DOMAIN,
        HOMEKIT_ACCESSORY_ID_KEY,
        f"{HOMEKIT_CONTROLLER_DOMAIN}:serial-number",
    }
)

# Device-registry identifier domains that belong to a pairing protocol.
# Used to recognize live Matter / HomeKit / Z-Wave. Matching itself
# uses protocol + ha_device_id | native_id | serial.
PROTOCOL_IDENTIFIER_DOMAINS: Final[dict[str, frozenset[str]]] = {
    PROTOCOL_MATTER: frozenset({MATTER_DOMAIN}),
    PROTOCOL_HOMEKIT: HOMEKIT_IDENTIFIER_DOMAINS,
    PROTOCOL_ZWAVE: frozenset({ZWAVE_JS_DOMAIN}),
}

PANEL_URL_PATH: Final = DOMAIN
PANEL_STATIC_URL_PATH: Final = f"/{DOMAIN}_static"
PANEL_ICON: Final = "mdi:qrcode"
PANEL_TITLE: Final = "Setup Codes"

REFRESH_COOLDOWN: Final = 2.0
EVENT_UPDATED: Final = f"{DOMAIN}_updated"

STATUS_AVAILABLE: Final = "available"
STATUS_UNAVAILABLE: Final = "unavailable"
STATUS_REMOVED: Final = "removed"
STATUS_LABELS: Final = {
    STATUS_AVAILABLE: "Available",
    STATUS_UNAVAILABLE: "Unavailable",
    STATUS_REMOVED: "Removed",
}
