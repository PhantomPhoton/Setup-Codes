"""Config flow for Setup Codes."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlow,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.core import callback

from .const import (
    CONF_SCAN_HOMEKIT,
    CONF_SCAN_MATTER,
    CONF_SCAN_ZWAVE,
    DOMAIN,
    SCAN_OPTION_DEFAULTS,
)


def _scan_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    values = {**SCAN_OPTION_DEFAULTS, **(defaults or {})}
    return vol.Schema(
        {
            vol.Required(CONF_SCAN_MATTER, default=values[CONF_SCAN_MATTER]): bool,
            vol.Required(CONF_SCAN_HOMEKIT, default=values[CONF_SCAN_HOMEKIT]): bool,
            vol.Required(CONF_SCAN_ZWAVE, default=values[CONF_SCAN_ZWAVE]): bool,
        }
    )


def _scan_options(user_input: dict[str, Any]) -> dict[str, bool]:
    return {
        CONF_SCAN_MATTER: bool(user_input[CONF_SCAN_MATTER]),
        CONF_SCAN_HOMEKIT: bool(user_input[CONF_SCAN_HOMEKIT]),
        CONF_SCAN_ZWAVE: bool(user_input[CONF_SCAN_ZWAVE]),
    }


class SetupCodesConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Setup Codes."""

    VERSION = 1

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return SetupCodesOptionsFlow()

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")

        if user_input is None:
            return self.async_show_form(step_id="user", data_schema=_scan_schema())

        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(
            title="Setup Codes",
            data={},
            options=_scan_options(user_input),
        )


class SetupCodesOptionsFlow(OptionsFlow):
    """Enable or disable protocol scanning."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=_scan_options(user_input))

        return self.async_show_form(
            step_id="init",
            data_schema=_scan_schema(dict(self.config_entry.options)),
        )
