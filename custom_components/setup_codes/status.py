"""Live device status for setup-code records. Not persisted."""

from __future__ import annotations

from typing import Any

from homeassistant.const import STATE_UNAVAILABLE
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr, entity_registry as er
from homeassistant.helpers.device_registry import DeviceEntryType

from .const import STATUS_AVAILABLE, STATUS_REMOVED, STATUS_UNAVAILABLE
from .protocols import identifiers_for_protocol


def record_in_home_assistant(hass: HomeAssistant, record: dict[str, Any]) -> bool:
    """True if this pairing slot still points at a live HA device for its protocol."""
    ha_id = record.get("ha_device_id")
    protocol = record.get("protocol") or ""
    if not ha_id or not protocol:
        return False
    device = dr.async_get(hass).async_get(ha_id)
    if device is None or device.entry_type == DeviceEntryType.SERVICE:
        return False
    return bool(identifiers_for_protocol(protocol, device.identifiers))


def device_is_available(hass: HomeAssistant, device_id: str) -> bool:
    """True if any enabled entity on the device is not unavailable."""
    registry = er.async_get(hass)
    entries = er.async_entries_for_device(
        registry, device_id, include_disabled_entities=False
    )
    for entry in entries:
        state = hass.states.get(entry.entity_id)
        if state is not None and state.state != STATE_UNAVAILABLE:
            return True
    return False


def record_status(hass: HomeAssistant, record: dict[str, Any]) -> str:
    """Available / unavailable while in HA; removed once the device is gone."""
    if not record_in_home_assistant(hass, record):
        return STATUS_REMOVED
    if device_is_available(hass, record["ha_device_id"]):
        return STATUS_AVAILABLE
    return STATUS_UNAVAILABLE
