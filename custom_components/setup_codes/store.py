"""Persistent store for setup-code records."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .protocols import native_id_from_identifiers

DEFAULT_DATA: dict[str, Any] = {"devices": []}


class SetupCodesStore:
    """JSON store in `.storage/setup_codes`."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {"devices": []}

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if isinstance(loaded, dict) and isinstance(loaded.get("devices"), list):
            self._data = loaded
        else:
            self._data = {"devices": []}
        if self._strip_legacy():
            await self._store.async_save(self._data)

    async def async_save(self) -> None:
        self._strip_legacy()
        await self._store.async_save(self._data)

    def _strip_legacy(self) -> bool:
        changed = False
        for record in self.devices:
            if "in_home_assistant" in record:
                record.pop("in_home_assistant", None)
                changed = True
            if "area_name" in record:
                record.pop("area_name", None)
                changed = True
            if not record.get("native_id"):
                native_id = native_id_from_identifiers(
                    record.get("protocol") or "",
                    record.get("identifiers"),
                )
                if native_id:
                    record["native_id"] = native_id
                    changed = True
            if "identifiers" in record:
                record.pop("identifiers", None)
                changed = True
        return changed

    @property
    def devices(self) -> list[dict[str, Any]]:
        return self._data["devices"]

    def get(self, record_id: str) -> dict[str, Any] | None:
        for record in self.devices:
            if record.get("id") == record_id:
                return record
        return None

    def upsert(self, record: dict[str, Any]) -> None:
        for index, existing in enumerate(self.devices):
            if existing.get("id") == record["id"]:
                self.devices[index] = record
                return
        self.devices.append(record)

    def delete(self, record_id: str) -> bool:
        before = len(self.devices)
        self._data["devices"] = [
            record for record in self.devices if record.get("id") != record_id
        ]
        return len(self.devices) != before
