"""Protocol plugins: snapshot HA devices for pairing-code records."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers.device_registry import DeviceEntryType

from .const import (
    ENABLED_PROTOCOLS,
    HOMEKIT_ACCESSORY_ID_KEY,
    HOMEKIT_CONTROLLER_DOMAIN,
    HOMEKIT_LEGACY_ACCESSORY_ID_KEY,
    MATTER_DEVICE_ID_PREFIX,
    MATTER_DOMAIN,
    PROTOCOL_HOMEKIT,
    PROTOCOL_IDENTIFIER_DOMAINS,
    PROTOCOL_LABELS,
    PROTOCOL_MATTER,
    PROTOCOL_ZWAVE,
    ZWAVE_JS_DOMAIN,
    ZWAVE_PROVISION_ID_PREFIX,
)
from .zwave_code import canonicalize_dsk

Snapshot = dict[str, Any]
ScanFn = Callable[[HomeAssistant], list[Snapshot]]


@dataclass(frozen=True)
class ProtocolPlugin:
    """One pairing-code protocol (Matter, HomeKit, Z-Wave)."""

    protocol: str
    label: str
    enabled: bool
    scan: ScanFn | None


def identifiers_for_protocol(protocol: str, identifiers: Any) -> list[list[str]]:
    """Keep device-registry identifiers that belong to this pairing protocol."""
    domains = PROTOCOL_IDENTIFIER_DOMAINS.get(protocol, frozenset())
    result: list[list[str]] = []
    for item in identifiers or []:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            domain, ident = str(item[0]), str(item[1])
            if domain in domains or (
                protocol == PROTOCOL_HOMEKIT
                and domain.startswith(f"{HOMEKIT_CONTROLLER_DOMAIN}:")
            ):
                result.append([domain, ident])
    result.sort(key=lambda pair: (pair[0], pair[1]))
    return result


def _identifier_pairs(identifiers: Any) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for item in identifiers or []:
        if isinstance(item, (list, tuple)) and len(item) == 2:
            pairs.append((str(item[0]), str(item[1])))
    return pairs


def native_id_from_identifiers(protocol: str, identifiers: Any) -> str | None:
    """Protocol-native identity from a device-registry identifier set.

    Matter: `deviceid_…` (not `serial_…`, which is already serial_number).
    HomeKit: `homekit_controller:accessory-id` (`{pairing}:aid:{aid}`).
    Z-Wave: `{home_id}-{node_id}` (not `provision_…` SmartStart placeholders).
    """
    pairs = _identifier_pairs(identifiers)
    if protocol == PROTOCOL_MATTER:
        device_ids = [
            value
            for domain, value in pairs
            if domain == MATTER_DOMAIN and value.startswith(MATTER_DEVICE_ID_PREFIX)
        ]
        if device_ids:
            return sorted(device_ids)[0]
        return None
    if protocol == PROTOCOL_HOMEKIT:
        for key in (HOMEKIT_ACCESSORY_ID_KEY, HOMEKIT_LEGACY_ACCESSORY_ID_KEY):
            values = [value for domain, value in pairs if domain == key]
            if values:
                return sorted(values)[0]
        return None
    if protocol == PROTOCOL_ZWAVE:
        node_ids = [
            value
            for domain, value in pairs
            if domain == ZWAVE_JS_DOMAIN
            and not value.startswith(ZWAVE_PROVISION_ID_PREFIX)
            and value.count("-") == 1
            and value.replace("-", "", 1).isdigit()
        ]
        if node_ids:
            return sorted(node_ids)[0]
        return None
    return None


def _is_protocol_device(device: dr.DeviceEntry, protocol: str) -> bool:
    if device.entry_type == DeviceEntryType.SERVICE:
        return False
    return bool(identifiers_for_protocol(protocol, device.identifiers))


def _device_snapshot(
    device: dr.DeviceEntry,
    protocol: str,
    fallback_name: str,
    *,
    discovered_setup_code: str | None = None,
) -> Snapshot:
    snapshot: Snapshot = {
        "protocol": protocol,
        "ha_device_id": device.id,
        "native_id": native_id_from_identifiers(protocol, device.identifiers),
        "name": device.name_by_user or device.name or fallback_name,
        "manufacturer": device.manufacturer,
        "model": device.model or getattr(device, "model_id", None),
        "serial_number": device.serial_number,
        "area_id": device.area_id,
    }
    if discovered_setup_code:
        snapshot["discovered_setup_code"] = discovered_setup_code
    return snapshot


def _scan_protocol(
    hass: HomeAssistant, protocol: str, fallback_name: str
) -> list[Snapshot]:
    registry = dr.async_get(hass)
    snapshots: list[Snapshot] = []
    for device in registry.devices:
        if not _is_protocol_device(device, protocol):
            continue
        snapshots.append(_device_snapshot(device, protocol, fallback_name))
    snapshots.sort(key=lambda item: (item["name"] or "").lower())
    return snapshots


def scan_matter_devices(hass: HomeAssistant) -> list[Snapshot]:
    """Return cached-field snapshots for Matter devices in the device registry."""
    return _scan_protocol(hass, PROTOCOL_MATTER, "Matter device")


def scan_homekit_devices(hass: HomeAssistant) -> list[Snapshot]:
    """Return cached-field snapshots for HomeKit Controller accessories."""
    return _scan_protocol(hass, PROTOCOL_HOMEKIT, "HomeKit device")


def _zwave_node(hass: HomeAssistant, device: dr.DeviceEntry) -> Any | None:
    """Return the live zwave_js node for this device, if the integration is up."""
    try:
        from homeassistant.components.zwave_js.helpers import (
            async_get_node_from_device_id,
        )
    except ImportError:
        return None
    try:
        return async_get_node_from_device_id(hass, device.id)
    except (AttributeError, KeyError, ValueError):
        return None


def _zwave_dsk(node: Any) -> str | None:
    raw = getattr(node, "dsk", None)
    if not raw:
        data = getattr(node, "data", None)
        if isinstance(data, dict):
            raw = data.get("dsk")
    if not raw:
        return None
    return canonicalize_dsk(str(raw))


def scan_zwave_devices(hass: HomeAssistant) -> list[Snapshot]:
    """Return cached-field snapshots for included Z-Wave JS nodes."""
    registry = dr.async_get(hass)
    snapshots: list[Snapshot] = []
    for device in registry.devices:
        if not _is_protocol_device(device, PROTOCOL_ZWAVE):
            continue
        if native_id_from_identifiers(PROTOCOL_ZWAVE, device.identifiers) is None:
            continue
        node = _zwave_node(hass, device)
        if node is not None and getattr(node, "is_controller_node", False):
            continue
        snapshots.append(
            _device_snapshot(
                device,
                PROTOCOL_ZWAVE,
                "Z-Wave device",
                discovered_setup_code=_zwave_dsk(node) if node is not None else None,
            )
        )
    snapshots.sort(key=lambda item: (item["name"] or "").lower())
    return snapshots


PLUGINS: dict[str, ProtocolPlugin] = {
    PROTOCOL_MATTER: ProtocolPlugin(
        protocol=PROTOCOL_MATTER,
        label=PROTOCOL_LABELS[PROTOCOL_MATTER],
        enabled=PROTOCOL_MATTER in ENABLED_PROTOCOLS,
        scan=scan_matter_devices,
    ),
    PROTOCOL_HOMEKIT: ProtocolPlugin(
        protocol=PROTOCOL_HOMEKIT,
        label=PROTOCOL_LABELS[PROTOCOL_HOMEKIT],
        enabled=PROTOCOL_HOMEKIT in ENABLED_PROTOCOLS,
        scan=scan_homekit_devices,
    ),
    PROTOCOL_ZWAVE: ProtocolPlugin(
        protocol=PROTOCOL_ZWAVE,
        label=PROTOCOL_LABELS[PROTOCOL_ZWAVE],
        enabled=PROTOCOL_ZWAVE in ENABLED_PROTOCOLS,
        scan=scan_zwave_devices,
    ),
}


def enabled_plugins() -> list[ProtocolPlugin]:
    return [plugin for plugin in PLUGINS.values() if plugin.enabled]


def scan_all(hass: HomeAssistant) -> list[Snapshot]:
    snapshots: list[Snapshot] = []
    for plugin in enabled_plugins():
        if plugin.scan is None:
            continue
        snapshots.extend(plugin.scan(hass))
    return snapshots
