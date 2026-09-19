"""Merge HA device snapshots into the setup-codes store."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.debounce import Debouncer
from homeassistant.helpers.device_registry import EVENT_DEVICE_REGISTRY_UPDATED
from homeassistant.helpers.area_registry import EVENT_AREA_REGISTRY_UPDATED

from .const import EVENT_UPDATED, REFRESH_COOLDOWN
from .matter_code import normalize_setup_code
from .protocols import scan_all
from .store import SetupCodesStore

import logging

_LOGGER = logging.getLogger(__name__)


def _clean_text(value: str | None) -> str | None:
    return (value or "").strip() or None


_UNSET = object()


def _utcnow() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _records_match(record: dict[str, Any], snapshot: dict[str, Any]) -> bool:
    """True if snapshot is the same pairing-code slot as record.

    Identity is (protocol, HA device id | native_id | serial). Protocol is
    required so a HomeKit accessory that later joins Matter keeps both setup
    codes even when serial overlaps.
    """
    protocol = snapshot.get("protocol")
    if not protocol or record.get("protocol") != protocol:
        return False
    ha_id = snapshot.get("ha_device_id")
    if ha_id and record.get("ha_device_id") == ha_id:
        return True
    native_id = snapshot.get("native_id")
    if native_id and record.get("native_id") == native_id:
        return True
    serial = snapshot.get("serial_number")
    if serial and record.get("serial_number") == serial:
        return True
    return False


def _cache_key(record: dict[str, Any]) -> tuple[Any, ...]:
    return (
        record.get("ha_device_id"),
        record.get("native_id"),
        record.get("name"),
        record.get("manufacturer"),
        record.get("model"),
        record.get("serial_number"),
        record.get("area_id"),
    )


def _apply_snapshot(record: dict[str, Any], snapshot: dict[str, Any]) -> bool:
    """Update cached HA fields. Fills an empty setup_code from a discovered DSK."""
    before = _cache_key(record)
    record["ha_device_id"] = snapshot.get("ha_device_id")
    record["native_id"] = snapshot.get("native_id")
    record["name"] = snapshot.get("name") or record.get("name") or "Device"
    record["manufacturer"] = snapshot.get("manufacturer")
    record["model"] = snapshot.get("model")
    record["serial_number"] = snapshot.get("serial_number")
    record["area_id"] = snapshot.get("area_id")
    record.pop("area_name", None)
    record.pop("identifiers", None)
    changed = _cache_key(record) != before
    discovered = snapshot.get("discovered_setup_code")
    if discovered and not record.get("setup_code"):
        record["setup_code"] = discovered
        changed = True
    if not changed:
        return False
    record["updated_at"] = _utcnow()
    return True


def _new_record(snapshot: dict[str, Any]) -> dict[str, Any]:
    now = _utcnow()
    protocol = snapshot["protocol"]
    return {
        "id": uuid4().hex,
        "protocol": protocol,
        "ha_device_id": snapshot.get("ha_device_id"),
        "native_id": snapshot.get("native_id"),
        "name": snapshot.get("name") or "Device",
        "manufacturer": snapshot.get("manufacturer"),
        "model": snapshot.get("model"),
        "serial_number": snapshot.get("serial_number"),
        "area_id": snapshot.get("area_id"),
        "setup_code": snapshot.get("discovered_setup_code"),
        "notes": None,
        "created_at": now,
        "updated_at": now,
    }


class SetupCodesManager:
    """Owns the store, HA device sync, and record mutations."""

    def __init__(self, hass: HomeAssistant, store: SetupCodesStore) -> None:
        self.hass = hass
        self.store = store
        self._unsubs: list[Any] = []
        self._debouncer: Debouncer[None] | None = None
        self._area_registry_dirty = False

    async def async_setup(self) -> None:
        await self.store.async_load()
        await self.async_sync()
        self._debouncer = Debouncer(
            self.hass,
            _LOGGER,
            cooldown=REFRESH_COOLDOWN,
            immediate=False,
            function=self.async_sync,
        )
        self._unsubs.append(
            self.hass.bus.async_listen(
                EVENT_DEVICE_REGISTRY_UPDATED, self._async_on_registry
            )
        )
        self._unsubs.append(
            self.hass.bus.async_listen(
                EVENT_AREA_REGISTRY_UPDATED, self._async_on_registry
            )
        )

    @callback
    def async_unload(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()
        if self._debouncer is not None:
            self._debouncer.async_shutdown()
            self._debouncer = None

    @callback
    def _async_on_registry(self, event: Any) -> None:
        if getattr(event, "event_type", None) == EVENT_AREA_REGISTRY_UPDATED:
            self._area_registry_dirty = True
        if self._debouncer is not None:
            self._debouncer.async_schedule_call()

    @callback
    def _async_notify_updated(self) -> None:
        self.hass.bus.async_fire(EVENT_UPDATED)

    async def async_sync(self) -> list[dict[str, Any]]:
        """Refresh cached HA fields. Removed devices stay in the store."""
        snapshots = scan_all(self.hass)
        matched_ids: set[str] = set()
        changed = False
        area_dirty = self._area_registry_dirty
        self._area_registry_dirty = False

        for snapshot in snapshots:
            existing = next(
                (
                    record
                    for record in self.store.devices
                    if record.get("id") not in matched_ids
                    and _records_match(record, snapshot)
                ),
                None,
            )
            if existing is None:
                record = _new_record(snapshot)
                self.store.upsert(record)
                matched_ids.add(record["id"])
                changed = True
                continue
            if _apply_snapshot(existing, snapshot):
                changed = True
            matched_ids.add(existing["id"])

        if changed:
            self.store.devices.sort(key=lambda item: (item.get("name") or "").lower())
            await self.store.async_save()
        if changed or area_dirty:
            self._async_notify_updated()
        return self.store.devices

    async def async_update_record(
        self,
        record_id: str,
        *,
        setup_code: str | None | object = _UNSET,
        notes: str | None | object = _UNSET,
    ) -> dict[str, Any]:
        record = self.store.get(record_id)
        if record is None:
            raise KeyError(record_id)
        if setup_code is not _UNSET:
            record["setup_code"] = normalize_setup_code(
                record.get("protocol") or "",
                setup_code,  # type: ignore[arg-type]
            )
        if notes is not _UNSET:
            record["notes"] = _clean_text(notes)  # type: ignore[arg-type]
        record["updated_at"] = _utcnow()
        await self.store.async_save()
        self._async_notify_updated()
        return record

    async def async_delete(self, record_id: str) -> None:
        if not self.store.delete(record_id):
            raise KeyError(record_id)
        await self.store.async_save()
        self._async_notify_updated()
