# Setup Codes

HACS custom integration that keeps pairing / setup codes for Matter, HomeKit, and Z-Wave devices and shows them in a sidebar panel.

Home Assistant does not store Matter or HomeKit codes after commissioning. This integration scans the device registry, caches name / manufacturer / model / serial / area id / native id, and lets you attach the code and notes yourself. For Z-Wave JS nodes included with S2, the DSK is copied in when the setup-code field is empty. Area names are read live from the area registry when the panel lists devices; a removed area shows as its id. If a device leaves Home Assistant, the record stays until you delete it and shows as **Removed**. Status is always live: **Available** / **Unavailable** from entity availability, **Removed** from the device registry. Re-add matching is per protocol (`ha_device_id`, then `native_id`, then serial), so a HomeKit accessory that later joins Matter gets a second row even when serial overlaps.

<img width="1661" height="666" alt="List" src="https://github.com/user-attachments/assets/099aab5e-f642-4a62-9cf9-ad8a9fc3ca42" />

<img width="1702" height="680" alt="Edit Box" src="https://github.com/user-attachments/assets/1906eabb-1458-4a78-8576-528ee73edffc" />

## Supported Protocols

Which protocols to scan is chosen at install time and can be changed later under **Settings → Devices & services → Setup Codes → Configure**. Turning a protocol off stops adding new devices of that type. Records already in the list stay.

### Matter

Paste an `MT:` QR payload or the **11-digit** code printed on the device (`XXXX-XXX-XXXX`). A 21-digit code is accepted too; the list shows the 11-digit code you type when pairing. Invalid checksums are rejected.

An `MT:` payload also shows a QR in the details dialog. Typed 11- or 21-digit codes do not.

### HomeKit

Paste an `X-HM://` QR payload or the **8-digit** code (`XXX-XX-XXX`). Repeating digits, `12345678`, and `87654321` are rejected.

An `X-HM://` payload also shows a QR in the details dialog. Typed 8-digit codes do not.

### Z-Wave

For S2-included nodes, the **DSK** is copied in when the field is empty. You can also paste a **SmartStart QR** (digits starting with `90`). The list shows the **5-digit PIN** (first DSK group); the details dialog has the full DSK or QR plus a scannable QR code.

The Z-Wave controller is not listed. A value you entered yourself is left alone.

## Installation

You can install this component in two ways: via [HACS](https://github.com/hacs/integration) or manually.

### Option A: Installing via HACS (custom repository)

1. Open HACS
2. Integrations → ⋮ → Custom repositories
3. Add https://github.com/PhantomPhoton/Setup-Codes as an Integration
4. Install "Setup Codes"

### Option B: Manual installation (custom_component)

1. Copy the `custom_components/setup_codes` directory to your `custom_components` directory

Then, for either option:

1. Restart Home Assistant
2. Go to **Settings → Devices & services**
3. Click **+ Add Integration**
4. Search for **Setup Codes**
5. Select the integration and follow the setup workflow

Once finished, it shows up as a sidebar panel for administrators.

## Access

Setup Codes requires a Home Assistant **administrator**, the same privilege needed to add devices under **Settings → Devices & services**. Non-administrators do not see the sidebar item, cannot open `/setup_codes`, and cannot list or change stored codes through the WebSocket API.

## Storage

Records live in Home Assistant `Store` (`.storage/setup_codes`), not Recorder. Setup codes are not written to logs. Setup codes are backed up as part of the standard Home Assistant backup system.

## Thanks

QR codes in the panel are generated with [uqr](https://github.com/unjs/uqr) (MIT), which builds on [Nayuki’s QR Code generator](https://www.nayuki.io/page/qr-code-generator-library). Thanks to Project Nayuki and Anthony Fu.

# My other Home Assistant custom components

* [S3 Compatible](https://github.com/PhantomPhoton/S3-Compatible) - Allows self hosted S3 compatible endpoints as Home Assistant backup targets
* [Matter Extensions](https://github.com/PhantomPhoton/Matter-Extensions) - Provide additional Matter functionality for devices that Home Assistant does not provide yet

  
