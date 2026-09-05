# Setup Codes

HACS custom integration that keeps pairing / setup codes for Matter and HomeKit devices and shows them in a sidebar panel.

Home Assistant does not store these codes after commissioning. This integration scans the device registry, caches name / manufacturer / model / serial / area id / native id, and lets you attach the code and notes yourself. Area names are read live from the area registry when the panel lists devices; a removed area shows as its id. If a device leaves Home Assistant, the record stays until you delete it and shows as **Removed**. Status is always live: **Available** / **Unavailable** from entity availability, **Removed** from the device registry. Re-add matching is per protocol (`ha_device_id`, then `native_id`, then serial), so a HomeKit accessory that later joins Matter gets a second row even when serial overlaps.

## Panel

The table columns follow **Settings → Devices**: protocol brand icon, Device (name and labels), Area, Manufacturer, Model, Serial, Status, Setup Code. A copy icon next to a stored code copies it without opening the details dialog. On narrow / mobile the row is three lines (name + area + status, manufacturer / model / serial, setup code + copy) instead of stuffing every column into the secondary line. Sort, grouping, and collapsed groups are remembered in the browser (`localStorage`), like Settings → Devices.

- `hass-tabs-subpage-data-table` (search, sort, group, column settings)
- `ha-filter-floor-areas` (floors / areas)
- `ha-filter-states` (manufacturer, protocol, available / unavailable / removed, has a code or not)

Those widgets are lazy-loaded with the devices dashboard. The panel preloads that config route so they exist even if you have not opened Settings → Devices in this session.

Click a row to set or clear the code, edit notes, and open the matching Home Assistant device page. Delete is only offered for records that are no longer in Home Assistant.

Matter setup codes may be an `MT:` QR payload (stored as-is, not validated yet) or an **11- or 21-digit manual pairing code**. Manual codes have spaces/dashes stripped on save; 11-digit codes are shown as `XXXX-XXX-XXXX` in the panel. The last digit is a Verhoeff checksum and the first digit must match the short vs long form.

HomeKit setup codes may be an `X-HM://` QR payload (stored as-is, not validated yet) or an **8-digit HAP setup code**. Digits are stored without dashes and shown as `XXX-XX-XXX`. Spec-invalid codes (repeating digits, `12345678`, `87654321`) are rejected. Clearing either field is allowed.

## Installation

You can install this component in two ways: via [HACS](https://github.com/hacs/integration) or manually.

### Option A: Installing via HACS (custom repository)

1. Open HACS
2. Integrations → ⋮ → Custom repositories
3. Add https://github.com/PhantomPhoton/Setup-Codes as an Integration
4. Install "Setup Codes"
5. Restart Home Assistant
6. Go to "Settings->Devices & Services".
7. Click "+ Add Integration".
8. Search for "Setup Codes"
9. Select the integration and **Follow setup workflow**
10. Once finished, it will show up as an available panel for administrators.

### Option B: Manual installation (custom_component)

1. Copy the `custom_components/setup_codes` directory to your custom_components directory
2. Restart Home Assistant
3. Go to "Settings->Devices & Services".
4. Click "+ Add Integration".
5. Search for "Setup Codes"
6. Select the integration and **Follow setup workflow**
7. Once finished, it will show up as an available panel for administrators.

## Access

Setup Codes requires a Home Assistant **administrator**, the same privilege needed to add devices under **Settings → Devices & services**. Non-administrators do not see the sidebar item, cannot open `/setup_codes`, and cannot list or change stored codes through the WebSocket API.

## Storage

Records live in Home Assistant `Store` (`.storage/setup_codes`), not Recorder. Setup codes are not written to logs.
