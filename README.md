# Setup Codes

HACS custom integration that keeps pairing / setup codes for Matter, HomeKit, and Z-Wave devices and shows them in a sidebar panel.

Home Assistant does not store Matter or HomeKit codes after commissioning. This integration scans the device registry, caches name / manufacturer / model / serial / area id / native id, and lets you attach the code and notes yourself. For Z-Wave JS nodes included with S2, the DSK is copied in when the setup-code field is empty. Area names are read live from the area registry when the panel lists devices; a removed area shows as its id. If a device leaves Home Assistant, the record stays until you delete it and shows as **Removed**. Status is always live: **Available** / **Unavailable** from entity availability, **Removed** from the device registry. Re-add matching is per protocol (`ha_device_id`, then `native_id`, then serial), so a HomeKit accessory that later joins Matter gets a second row even when serial overlaps.

<img width="1661" height="666" alt="List" src="https://github.com/user-attachments/assets/099aab5e-f642-4a62-9cf9-ad8a9fc3ca42" />

<img width="1702" height="680" alt="Edit Box" src="https://github.com/user-attachments/assets/1906eabb-1458-4a78-8576-528ee73edffc" />

## Panel

The table columns follow **Settings → Devices**: protocol brand icon, Device (name and labels), Area, Manufacturer, Model, Serial, Status, Setup Code. A copy icon next to a stored code copies it without opening the details dialog. On narrow / mobile the row is three lines (name + area + status, manufacturer / model / serial, setup code + copy) instead of stuffing every column into the secondary line. Sort, grouping, and collapsed groups are remembered in the browser (`localStorage`), like Settings → Devices.

- `hass-tabs-subpage-data-table` (search, sort, group, column settings)
- `ha-filter-floor-areas` (floors / areas)
- `ha-filter-states` (manufacturer, protocol, available / unavailable / removed, has a code or not)

Those widgets are lazy-loaded with the devices dashboard. The panel preloads that config route so they exist even if you have not opened Settings → Devices in this session.

Click a row to set or clear the code, edit notes, and open the matching Home Assistant device page. Delete is only offered for records that are no longer in Home Assistant. When the stored value is a scannable payload — Matter `MT:`, HomeKit `X-HM://`, a Z-Wave DSK, or a SmartStart `90…` string — the details dialog also shows a QR code. 11-digit / 21-digit Matter codes and 8-digit HomeKit codes are not QR payloads, so no code is drawn for those.

Matter setup codes may be an `MT:` QR payload or an **11- or 21-digit manual pairing code**. The table always shows the **11-digit** code you type when pairing (`XXXX-XXX-XXXX`), extracted from an `MT:` QR or reduced from a 21-digit code (VID/PID dropped, check digit recomputed). The details dialog shows that pairing code plus the full `MT:` / 21-digit value. Manual codes have spaces/dashes stripped on save. The last digit is a Verhoeff checksum and the first digit must match the short vs long form.

HomeKit setup codes may be an `X-HM://` QR payload or an **8-digit HAP setup code**. `X-HM://` payloads are decoded (9 base-36 characters packing the code, category, and pairing flags, plus a 4-character Setup ID). The table shows the extracted **8-digit** code (`XXX-XX-XXX`). The details dialog shows that setup code plus the full QR. Digits are stored without dashes. Spec-invalid codes (repeating digits, `12345678`, `87654321`) are rejected. Clearing either field is allowed.

Z-Wave setup codes may be a **40-digit DSK** (`aaaaa-bbbbb-ccccc-ddddd-eeeee-fffff-11111-22222`) or a **SmartStart QR** (digits starting with `90`). The table shows the **5-digit PIN** (first DSK group). The details dialog shows that PIN plus the full DSK / QR. When Z-Wave JS has a DSK for an S2-included node and the field is empty, the DSK is filled in automatically. A user-entered value is left alone. The Z-Wave controller node is not listed.

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


# My other Home Assistant custom components

* [S3 Compatible](https://github.com/PhantomPhoton/S3-Compatible) - Allows self hosted S3 compatible endpoints as Home Assistant backup targets
* [Matter Extensions](https://github.com/PhantomPhoton/Matter-Extensions) - Provide additional Matter functionality for devices that Home Assistant does not provide yet

  
