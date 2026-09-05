"""Sidebar panel registration."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components import frontend
from homeassistant.core import HomeAssistant

from .const import (
    PANEL_ICON,
    PANEL_STATIC_URL_PATH,
    PANEL_TITLE,
    PANEL_URL_PATH,
    VERSION,
)

WWW_DIR = Path(__file__).parent / "www"
_STATIC_REGISTERED = False


async def async_register_static(hass: HomeAssistant) -> None:
    """Serve www/ once for the HA lifetime."""
    global _STATIC_REGISTERED
    if _STATIC_REGISTERED:
        return
    try:
        from homeassistant.components.http import StaticPathConfig

        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    PANEL_STATIC_URL_PATH,
                    str(WWW_DIR),
                    cache_headers=False,
                )
            ]
        )
    except (ImportError, AttributeError):
        hass.http.register_static_path(
            PANEL_STATIC_URL_PATH, str(WWW_DIR), cache_headers=False
        )
    _STATIC_REGISTERED = True


async def async_register_panel(hass: HomeAssistant) -> None:
    """Add the sidebar item."""
    if PANEL_URL_PATH in hass.data.get("frontend_panels", {}):
        frontend.async_remove_panel(hass, PANEL_URL_PATH)
    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path=PANEL_URL_PATH,
        config={
            "_panel_custom": {
                "name": "setup-codes-panel",
                "embed_iframe": False,
                "trust_external": False,
                "handle_safe_area": True,
                "js_url": f"{PANEL_STATIC_URL_PATH}/panel.js?v={VERSION}",
            }
        },
        require_admin=True,
    )


def async_unregister_panel(hass: HomeAssistant) -> None:
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
