"""WebSocket API for the Setup Codes panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import area_registry as ar

from .const import DOMAIN, PROTOCOL_LABELS, STATUS_LABELS
from .manager import SetupCodesManager
from .matter_code import SetupCodeError
from .status import record_in_home_assistant, record_status


def _manager(hass: HomeAssistant) -> SetupCodesManager:
    return hass.data[DOMAIN]


def _area_label(hass: HomeAssistant, area_id: str | None) -> str | None:
    """Live area name, or the raw id if that area no longer exists."""
    if not area_id:
        return None
    area = ar.async_get(hass).async_get_area(area_id)
    if area is None:
        return area_id
    return area.name


def serialize_record(hass: HomeAssistant, record: dict[str, Any]) -> dict[str, Any]:
    """Public record for the panel."""
    protocol = record.get("protocol") or ""
    status = record_status(hass, record)
    return {
        "id": record["id"],
        "protocol": protocol,
        "protocol_label": PROTOCOL_LABELS.get(protocol, protocol),
        "ha_device_id": record.get("ha_device_id"),
        "in_home_assistant": record_in_home_assistant(hass, record),
        "status": status,
        "status_label": STATUS_LABELS[status],
        "name": record.get("name") or "Device",
        "manufacturer": record.get("manufacturer"),
        "model": record.get("model"),
        "serial_number": record.get("serial_number"),
        "area_id": record.get("area_id"),
        "area_name": _area_label(hass, record.get("area_id")),
        "setup_code": record.get("setup_code"),
        "notes": record.get("notes"),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_list)
    websocket_api.async_register_command(hass, ws_sync)
    websocket_api.async_register_command(hass, ws_set_code)
    websocket_api.async_register_command(hass, ws_delete)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/list"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_list(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = _manager(hass)
    connection.send_result(
        msg["id"],
        [serialize_record(hass, record) for record in manager.store.devices],
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/sync"})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_sync(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = _manager(hass)
    devices = await manager.async_sync()
    connection.send_result(msg["id"], [serialize_record(hass, record) for record in devices])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_code",
        vol.Required("record_id"): str,
        vol.Optional("setup_code"): vol.Any(str, None),
        vol.Optional("notes"): vol.Any(str, None),
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_set_code(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = _manager(hass)
    updates: dict[str, Any] = {}
    if "setup_code" in msg:
        updates["setup_code"] = msg["setup_code"]
    if "notes" in msg:
        updates["notes"] = msg["notes"]
    try:
        record = await manager.async_update_record(msg["record_id"], **updates)
    except KeyError as err:
        raise HomeAssistantError("Unknown device") from err
    except SetupCodeError as err:
        raise HomeAssistantError(str(err)) from err
    connection.send_result(msg["id"], serialize_record(hass, record))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/delete",
        vol.Required("record_id"): str,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_delete(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    manager = _manager(hass)
    try:
        await manager.async_delete(msg["record_id"])
    except KeyError as err:
        raise HomeAssistantError("Unknown device") from err
    connection.send_result(msg["id"])
