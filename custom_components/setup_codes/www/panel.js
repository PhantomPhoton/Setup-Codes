/**
 * Setup Codes sidebar panel.
 *
 * Reuses the same table chrome and filter widgets as Settings → Devices
 * (hass-tabs-subpage-data-table, ha-filter-floor-areas, ha-filter-states).
 * Those elements are lazy-loaded with the config/devices dashboard, so this
 * panel preloads that route before rendering.
 */
(() => {
  const TAG = "setup-codes-panel";
  const STORE_EVENT = "setup_codes_updated";
  const TABLE_SORT_KEY = "setup-codes-table-sort";
  const TABLE_GROUP_KEY = "setup-codes-table-grouping";
  const TABLE_COLLAPSE_KEY = "setup-codes-table-collapsed";
  const GROUPABLE_COLUMNS = ["area", "manufacturer", "model", "status"];
  const NEEDED = [
    "hass-tabs-subpage-data-table",
    "ha-filter-floor-areas",
    "ha-filter-states",
  ];
  const LOAD_TIMEOUT_MS = 15000;

  const PROTOCOL_BRAND_DOMAIN = {
    matter: "matter",
    homekit: "homekit_controller",
    zwave: "zwave_js",
  };

  const columns = (panel) => {
    const narrow = Boolean(panel._narrow);
    return {
      icon: {
        title: "",
        label: "Protocol",
        type: "icon",
        moveable: false,
        showNarrow: true,
        template: (row) => panel._protocolIcon(row),
      },
      name: {
        title: "Device",
        main: true,
        sortable: true,
        filterable: true,
        grows: true,
        direction: "asc",
        minWidth: "150px",
        flex: 2,
        template: narrow ? (row) => panel._narrowDeviceCell(row) : undefined,
        extraTemplate: narrow ? undefined : (row) => panel._deviceLabels(row),
      },
      area: {
        title: "Area",
        sortable: true,
        filterable: true,
        groupable: true,
        minWidth: "120px",
      },
      manufacturer: {
        title: "Manufacturer",
        sortable: true,
        filterable: true,
        groupable: true,
        minWidth: "120px",
      },
      model: {
        title: "Model",
        sortable: true,
        filterable: true,
        groupable: true,
        minWidth: "120px",
      },
      serial_number: {
        title: "Serial",
        sortable: true,
        filterable: true,
        minWidth: "120px",
      },
      status: {
        title: "Status",
        sortable: true,
        filterable: true,
        groupable: true,
        minWidth: "140px",
      },
      setup_code: {
        title: "Setup Code",
        sortable: true,
        filterable: true,
        minWidth: "180px",
        template: (row) => panel._setupCodeCell(row),
      },
    };
  };

  const withTimeout = (promise, ms, label) => {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out ${label}`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  const defined = (name) => customElements.get(name) !== undefined;

  async function loadConfigRoute(routeName) {
    await withTimeout(
      customElements.whenDefined("partial-panel-resolver"),
      LOAD_TIMEOUT_MS,
      "waiting for partial-panel-resolver"
    );
    const resolver = document.createElement("partial-panel-resolver");
    const panels = { tmp: { url_path: "tmp", component_name: "config" } };
    let routerOptions;
    if (typeof resolver._getRoutes === "function") {
      routerOptions = resolver._getRoutes(panels);
    } else if (typeof resolver._updateRoutes === "function") {
      resolver.hass = { panels };
      resolver._updateRoutes();
      routerOptions = resolver.routerOptions;
    }
    const loadConfig = routerOptions?.routes?.tmp?.load;
    if (typeof loadConfig !== "function") {
      throw new Error("Home Assistant config panel cannot be loaded");
    }
    await withTimeout(loadConfig(), LOAD_TIMEOUT_MS, "loading config panel");
    await withTimeout(
      customElements.whenDefined("ha-panel-config"),
      LOAD_TIMEOUT_MS,
      "waiting for ha-panel-config"
    );
    const configPanel = document.createElement("ha-panel-config");
    const loadRoute = configPanel.routerOptions?.routes?.[routeName]?.load;
    if (typeof loadRoute === "function") {
      await withTimeout(
        loadRoute(),
        LOAD_TIMEOUT_MS,
        `loading config/${routeName}`
      );
    }
  }

  async function loadHaTableElements() {
    if (!NEEDED.every(defined)) {
      await loadConfigRoute("devices");
      const missing = NEEDED.filter((name) => !defined(name));
      if (missing.length) {
        await Promise.all(
          missing.map((name) =>
            withTimeout(
              customElements.whenDefined(name),
              LOAD_TIMEOUT_MS,
              `waiting for ${name}`
            )
          )
        );
      }
    }
    if (!defined("ha-data-table-labels")) {
      try {
        await withTimeout(
          customElements.whenDefined("ha-data-table-labels"),
          3000,
          "waiting for ha-data-table-labels"
        );
      } catch (_err) {
        /* Device name column falls back to ha-label chips. */
      }
    }
  }

  function dash(value) {
    return value == null || value === "" ? "—" : value;
  }

  function readTablePref(key) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  function writeTablePref(key, value) {
    try {
      if (value === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (_err) {
      /* Safari private mode */
    }
  }

  function storedSorting(cols) {
    const stored = readTablePref(TABLE_SORT_KEY);
    if (
      stored &&
      cols[stored.column]?.sortable &&
      (stored.direction === "asc" || stored.direction === "desc")
    ) {
      return { column: stored.column, direction: stored.direction };
    }
    return { column: "name", direction: "asc" };
  }

  function storedGrouping() {
    const stored = readTablePref(TABLE_GROUP_KEY);
    if (typeof stored === "string" && GROUPABLE_COLUMNS.includes(stored)) {
      return stored;
    }
    return "";
  }

  function storedCollapsed() {
    const stored = readTablePref(TABLE_COLLAPSE_KEY);
    if (Array.isArray(stored) && stored.every((item) => typeof item === "string")) {
      return stored;
    }
    return [];
  }

  function resolveLabel(registry, labelId) {
    if (!registry) {
      return undefined;
    }
    if (typeof registry.get === "function") {
      return registry.get(labelId);
    }
    if (Array.isArray(registry)) {
      return registry.find((item) => item.label_id === labelId);
    }
    return registry[labelId];
  }

  function labelEntries(hass, record, labelById) {
    const device = hass?.devices?.[record.ha_device_id];
    const ids = device?.labels;
    if (!ids?.length) {
      return [];
    }
    const entries = [];
    for (const labelId of ids) {
      const entry =
        resolveLabel(labelById, labelId) ||
        resolveLabel(hass?.labels, labelId);
      if (entry && entry.name) {
        entries.push(entry);
      }
    }
    return entries;
  }

  const STATUS_LABELS = {
    available: "Available",
    unavailable: "Unavailable",
    removed: "Removed",
  };

  function availabilityByDeviceId(hass) {
    const entities = hass?.entities;
    if (!entities || typeof entities !== "object") {
      return null;
    }
    const ids = Object.keys(entities);
    if (!ids.length) {
      return null;
    }
    const map = new Map();
    const states = hass.states || {};
    for (const entityId of ids) {
      const entry = entities[entityId];
      const deviceId = entry?.device_id;
      if (!deviceId || entry.disabled_by) {
        continue;
      }
      if (map.get(deviceId) === true) {
        continue;
      }
      const state = states[entry.entity_id || entityId];
      if (state && state.state !== "unavailable") {
        map.set(deviceId, true);
      } else if (!map.has(deviceId)) {
        map.set(deviceId, false);
      }
    }
    return map;
  }

  function recordInHomeAssistant(hass, record) {
    const deviceId = record.ha_device_id;
    if (deviceId && hass?.devices && Object.keys(hass.devices).length) {
      if (!hass.devices[deviceId]) {
        return false;
      }
    }
    if (typeof record.in_home_assistant === "boolean") {
      return record.in_home_assistant;
    }
    return Boolean(deviceId);
  }

  function statusIdForRecord(record, availMap, hass) {
    if (!recordInHomeAssistant(hass, record)) {
      return "removed";
    }
    if (availMap) {
      return record.ha_device_id && availMap.get(record.ha_device_id) === true
        ? "available"
        : "unavailable";
    }
    if (record.status && STATUS_LABELS[record.status]) {
      return record.status;
    }
    return "unavailable";
  }

  function statusLabelForRecord(record, availMap, hass) {
    return STATUS_LABELS[statusIdForRecord(record, availMap, hass)];
  }

  function storeFingerprint(devices) {
    return (devices || [])
      .map((device) =>
        [
          device.id,
          device.ha_device_id || "",
          device.protocol || "",
          device.name || "",
          device.manufacturer || "",
          device.model || "",
          device.serial_number || "",
          device.area_id || "",
          device.area_name || "",
          device.setup_code || "",
          device.notes || "",
        ].join("\t")
      )
      .join("\n");
  }

  function statusFingerprint(hass, records, labelById) {
    const availMap = availabilityByDeviceId(hass);
    const dark = hass?.themes?.darkMode ? "1" : "0";
    const labelMeta = [...(labelById?.values?.() || [])]
      .map((entry) => `${entry.label_id}:${entry.name}:${entry.color || ""}`)
      .sort()
      .join("|");
    return `${dark}:${labelMeta}:${records
      .map((record) => {
        const status = statusIdForRecord(record, availMap, hass);
        const labels = (
          hass?.devices?.[record.ha_device_id]?.labels || []
        ).join(",");
        return `${record.id}:${status}:${labels}`;
      })
      .join(",")}`;
  }

  function zwaveDskDigits(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.startsWith("90") && digits.length >= 52) {
      return digits.slice(12, 52);
    }
    if (digits.length === 40) {
      return digits;
    }
    return null;
  }

  function zwavePinFromSetupCode(raw) {
    const dsk = zwaveDskDigits(raw);
    return dsk ? dsk.slice(0, 5) : null;
  }

  function formatZwaveDskOrQr(raw, empty) {
    const blank = empty === undefined ? "—" : empty;
    if (raw == null || String(raw).trim() === "") {
      return blank;
    }
    const digits = String(raw).replace(/\D/g, "");
    if (digits.startsWith("90") && digits.length >= 52) {
      return digits;
    }
    if (digits.length === 40) {
      return digits.match(/.{5}/g).join("-");
    }
    return String(raw).trim();
  }

  const BASE38_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-.";
  const MATTER_INVALID_PASSCODES = new Set([
    0, 11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777,
    88888888, 99999999, 12345678, 87654321,
  ]);

  function base38Decode(encoded) {
    const payload = String(encoded || "").toUpperCase();
    if (!payload) {
      return null;
    }
    const out = [];
    let index = 0;
    while (index < payload.length) {
      const remaining = payload.length - index;
      let chars;
      let nbytes;
      if (remaining >= 5) {
        chars = 5;
        nbytes = 3;
      } else if (remaining === 4) {
        chars = 4;
        nbytes = 2;
      } else if (remaining === 2) {
        chars = 2;
        nbytes = 1;
      } else {
        return null;
      }
      let value = 0;
      for (let offset = chars; offset > 0; offset -= 1) {
        const digit = BASE38_ALPHABET.indexOf(payload[index + offset - 1]);
        if (digit < 0) {
          return null;
        }
        value = value * 38 + digit;
      }
      index += chars;
      for (let byteIndex = 0; byteIndex < nbytes; byteIndex += 1) {
        out.push(value & 0xff);
        value = Math.floor(value / 256);
      }
      if (value) {
        return null;
      }
    }
    return out;
  }

  function readBits(data, start, length) {
    let value = 0;
    for (let bit = 0; bit < length; bit += 1) {
      const position = start + bit;
      const byteIndex = Math.floor(position / 8);
      if (byteIndex >= data.length) {
        break;
      }
      if (data[byteIndex] & (1 << (position % 8))) {
        value |= 1 << bit;
      }
    }
    return value;
  }

  function parseMtPayload(raw) {
    const stripped = String(raw || "").trim();
    if (!stripped.toUpperCase().startsWith("MT:")) {
      return null;
    }
    let encoded = stripped.slice(3).trim().split("*")[0].trim();
    if (encoded.includes("%")) {
      encoded = encoded.split("%")[0].trim();
    }
    const data = base38Decode(encoded);
    if (!data || data.length < 11) {
      return null;
    }
    let offset = 0;
    const version = readBits(data, offset, 3);
    offset += 3;
    const vendorId = readBits(data, offset, 16);
    offset += 16;
    const productId = readBits(data, offset, 16);
    offset += 16;
    const flow = readBits(data, offset, 2);
    offset += 2;
    offset += 8;
    const discriminator = readBits(data, offset, 12);
    offset += 12;
    const passcode = readBits(data, offset, 27);
    offset += 27;
    const padding = readBits(data, offset, 4);
    if (version !== 0 || padding !== 0) {
      return null;
    }
    if (passcode > 99999998 || MATTER_INVALID_PASSCODES.has(passcode)) {
      return null;
    }
    return { vendorId, productId, flow, discriminator, passcode };
  }

  const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

  function verhoeffCheckDigit(digits) {
    let checksum = 0;
    const withPlaceholder = `${digits}0`.split("").reverse();
    for (let index = 0; index < withPlaceholder.length; index += 1) {
      checksum =
        VERHOEFF_D[checksum][VERHOEFF_P[index % 8][Number(withPlaceholder[index])]];
    }
    return String(VERHOEFF_INV[checksum]);
  }

  function encodeMatterManualCode(discriminator, passcode) {
    const chunk1 = discriminator >> 10;
    const chunk2 = ((discriminator & 0x300) << 6) | (passcode & 0x3fff);
    const chunk3 = passcode >> 14;
    const payload = `${chunk1}${String(chunk2).padStart(5, "0")}${String(chunk3).padStart(4, "0")}`;
    return payload + verhoeffCheckDigit(payload);
  }

  function shortMatterManualFromDigits(digits) {
    if (digits.length === 11) {
      return validateMatterManualCode(digits) ? null : digits;
    }
    if (digits.length !== 21 || validateMatterManualCode(digits)) {
      return null;
    }
    const payload = `${Number(digits[0]) & 0b0011}${digits.slice(1, 10)}`;
    const shortCode = payload + verhoeffCheckDigit(payload);
    return validateMatterManualCode(shortCode) ? null : shortCode;
  }

  function matterManualFromMt(raw) {
    const parsed = parseMtPayload(raw);
    if (!parsed) {
      return null;
    }
    const digits = encodeMatterManualCode(parsed.discriminator, parsed.passcode);
    return validateMatterManualCode(digits) ? null : digits;
  }

  function matterPairingFromSetup(raw) {
    const stripped = String(raw || "").trim();
    if (!stripped) {
      return null;
    }
    if (stripped.toUpperCase().startsWith("MT:")) {
      return matterManualFromMt(stripped);
    }
    if (stripped.replace(/[\d\s.-]/g, "")) {
      return null;
    }
    return shortMatterManualFromDigits(stripped.replace(/\D/g, ""));
  }

  function formatMatterManual(digits) {
    if (!digits) {
      return "";
    }
    if (digits.length === 11) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return digits;
  }

  function formatSetupCode(protocol, raw, empty) {
    const blank = empty === undefined ? "—" : empty;
    if (raw == null || String(raw).trim() === "") {
      return blank;
    }
    const stripped = String(raw).trim();
    const proto = protocol || "matter";
    if (proto === "homekit") {
      if (stripped.toUpperCase().startsWith("X-HM:")) {
        return stripped;
      }
      const digits = stripped.replace(/\D/g, "");
      if (digits.length === 8) {
        return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
      }
      return stripped;
    }
    if (proto === "zwave") {
      return zwavePinFromSetupCode(stripped) || blank;
    }
    const manual = matterPairingFromSetup(stripped);
    if (manual) {
      return formatMatterManual(manual);
    }
    if (stripped.toUpperCase().startsWith("MT:")) {
      return stripped;
    }
    const digits = stripped.replace(/\D/g, "");
    if (digits.length === 11) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    return stripped;
  }

  const VERHOEFF_D = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
    [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
    [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
    [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
    [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
    [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
    [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
    [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
  ];
  const VERHOEFF_P = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
    [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
    [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
    [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
    [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
    [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
    [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
  ];

  function verhoeffValid(digits) {
    let checksum = 0;
    const reversed = digits.split("").reverse();
    for (let index = 0; index < reversed.length; index += 1) {
      checksum = VERHOEFF_D[checksum][VERHOEFF_P[index % 8][Number(reversed[index])]];
    }
    return checksum === 0;
  }

  const HOMEKIT_INVALID_CODES = new Set([
    "00000000",
    "11111111",
    "22222222",
    "33333333",
    "44444444",
    "55555555",
    "66666666",
    "77777777",
    "88888888",
    "99999999",
    "12345678",
    "87654321",
  ]);

  function validateHomekitSetupCode(raw) {
    const stripped = (raw || "").trim();
    if (!stripped) {
      return null;
    }
    if (stripped.toUpperCase().startsWith("X-HM:")) {
      // TODO: validate X-HM:// HAP setup payload and extract the 8-digit setup code
      return null;
    }
    const leftover = stripped.replace(/[\d\s.-]/g, "");
    if (leftover) {
      return "HomeKit setup codes are 8 digits (XXX-XX-XXX) or an X-HM:// payload.";
    }
    const digits = stripped.replace(/\D/g, "");
    if (digits.length !== 8) {
      return "HomeKit setup codes must be 8 digits.";
    }
    if (HOMEKIT_INVALID_CODES.has(digits)) {
      return "This is not a valid HomeKit setup code.";
    }
    return null;
  }

  function validateZwaveSetupCode(raw) {
    const stripped = (raw || "").trim();
    if (!stripped) {
      return null;
    }
    const leftover = stripped.replace(/[\d\s.-]/g, "");
    const digits = stripped.replace(/\D/g, "");
    if (digits.startsWith("90") && digits.length >= 52) {
      if (leftover) {
        return "Z-Wave SmartStart QR codes are digits starting with 90 (spaces are OK).";
      }
      return null;
    }
    if (leftover) {
      return "Z-Wave setup codes are a 40-digit DSK (8 groups of 5) or a 90… QR.";
    }
    if (digits.length !== 40) {
      return "Z-Wave setup codes are a 40-digit DSK (8 groups of 5) or a 90… QR.";
    }
    for (let index = 0; index < 40; index += 5) {
      if (Number(digits.slice(index, index + 5)) > 65535) {
        return "This is not a valid Z-Wave DSK.";
      }
    }
    return null;
  }

  function validateMatterManualCode(raw) {
    const stripped = (raw || "").trim();
    if (!stripped) {
      return null;
    }
    if (stripped.toUpperCase().startsWith("MT:")) {
      if (!matterManualFromMt(stripped)) {
        return "This is not a valid Matter MT: QR payload.";
      }
      return null;
    }
    const leftover = stripped.replace(/[\d\s.-]/g, "");
    if (leftover) {
      return "Matter manual pairing codes are 11 or 21 digits (spaces and dashes are OK).";
    }
    const digits = stripped.replace(/\D/g, "");
    if (digits.length !== 11 && digits.length !== 21) {
      return "Matter manual pairing codes must be 11 or 21 digits.";
    }
    const first = Number(digits[0]);
    if (first > 7) {
      return "This is not a valid Matter manual pairing code.";
    }
    const vidPidPresent = Boolean(first & 0b0100);
    if (vidPidPresent && digits.length !== 21) {
      return "This code includes vendor/product IDs and must be 21 digits.";
    }
    if (!vidPidPresent && digits.length !== 11) {
      return "This code does not include vendor/product IDs and must be 11 digits.";
    }
    if (!verhoeffValid(digits)) {
      return "That pairing code failed the Verhoeff checksum (typo or incomplete code).";
    }
    return null;
  }

  function toRow(record, availMap, hass, labelById) {
    const statusId = statusIdForRecord(record, availMap, hass);
    return {
      id: record.id,
      name: record.name || "Device",
      manufacturer: dash(record.manufacturer),
      model: dash(record.model),
      serial_number: dash(record.serial_number),
      area: dash(record.area_name),
      area_id: record.area_id,
      protocol: record.protocol_label || record.protocol || "—",
      protocol_id: record.protocol || "",
      brand_domain:
        PROTOCOL_BRAND_DOMAIN[record.protocol] || record.protocol || "",
      manufacturer_key: (record.manufacturer || "").trim() || "__none__",
      status: STATUS_LABELS[statusId],
      status_id: statusId,
      setup_code: formatSetupCode(record.protocol, record.setup_code),
      notes: dash(record.notes),
      in_home_assistant: recordInHomeAssistant(hass, record),
      has_code: Boolean(record.setup_code),
      label_entries: labelEntries(hass, record, labelById),
    };
  }

  function uniqueFilterStates(records, getValue, getLabel) {
    const seen = new Map();
    for (const record of records) {
      const value = getValue(record);
      if (!value) {
        continue;
      }
      if (!seen.has(value)) {
        seen.set(value, { value, label: getLabel(record) || value });
      }
    }
    return [...seen.values()].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
    );
  }

  function filterUsed(filter) {
    const value = filter?.value;
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === "object") {
      return Object.values(value).some((entry) =>
        Array.isArray(entry) ? entry.length : Boolean(entry)
      );
    }
    return Boolean(value);
  }

  function notify(el, message) {
    el.dispatchEvent(
      new CustomEvent("hass-notification", {
        detail: { message },
        bubbles: true,
        composed: true,
      })
    );
  }

  class SetupCodesPanel extends HTMLElement {
    constructor() {
      super();
      this._hass = undefined;
      this._narrow = false;
      this._groupColumn = storedGrouping();
      this._route = { prefix: "/setup_codes", path: "" };
      this._devices = [];
      this._filters = {
        area: {},
        manufacturer: {},
        protocol: {},
        status: {},
        code: {},
      };
      this._search = "";
      this._started = false;
      this._table = undefined;
      this._dialog = undefined;
      this._editing = undefined;
      this._statusFp = "";
      this._brandsToken = "";
      this._brandsTimer = undefined;
      this._darkMode = undefined;
      this._labelById = new Map();
      this._labelsStarted = false;
      this._unsubLabels = undefined;
      this._labelsDebounce = undefined;
      this._storeFp = "";
      this._storeEventsStarted = false;
      this._unsubStore = undefined;
      this._storeDebounce = undefined;
      this._loadDevicesInFlight = false;
      this._loadDevicesAgain = false;
    }

    set hass(hass) {
      const dark = Boolean(hass?.themes?.darkMode);
      const darkChanged = this._darkMode !== undefined && dark !== this._darkMode;
      this._darkMode = dark;
      this._hass = hass;
      if (hass?.callWS) {
        this._ensureLabels();
        this._ensureStoreEvents();
      }
      if (this._table) {
        this._table.hass = hass;
        this._syncChildHass();
        if (darkChanged) {
          this._apply();
        } else {
          this._maybeRefreshStatus();
        }
      }
    }

    set narrow(narrow) {
      this._narrow = Boolean(narrow);
      if (this._table) {
        this._syncTableLayout();
      }
      if (this._areaFilter) {
        this._areaFilter.narrow = this._narrow;
      }
      if (this._statusFilter) {
        this._statusFilter.narrow = this._narrow;
      }
      if (this._codeFilter) {
        this._codeFilter.narrow = this._narrow;
      }
      if (this._manufacturerFilter) {
        this._manufacturerFilter.narrow = this._narrow;
      }
      if (this._protocolFilter) {
        this._protocolFilter.narrow = this._narrow;
      }
    }

    set route(route) {
      this._route = route || this._route;
      if (this._table) {
        this._table.route = this._route;
      }
    }

    connectedCallback() {
      this.style.display = "block";
      this.style.height = "100%";
      this.style.boxSizing = "border-box";
      if (this._started) {
        this._ensureLabels();
        this._ensureStoreEvents();
        return;
      }
      this._started = true;
      this._init();
    }

    async _init() {
      this._showStatus("Loading Setup Codes…");
      try {
        await loadHaTableElements();
      } catch (err) {
        this._showStatus(
          `Could not load Home Assistant's devices table (${err.message}). Open Settings → Devices once, then reopen this panel.`
        );
        return;
      }
      this._build();
      await this._ensureBrandsToken();
      await this._ensureLabels();
      await this._ensureStoreEvents();
      await this._loadDevices();
    }

    disconnectedCallback() {
      if (this._brandsTimer) {
        clearInterval(this._brandsTimer);
        this._brandsTimer = undefined;
      }
      if (this._labelsDebounce) {
        clearTimeout(this._labelsDebounce);
        this._labelsDebounce = undefined;
      }
      if (typeof this._unsubLabels === "function") {
        this._unsubLabels();
      }
      this._unsubLabels = undefined;
      this._labelsStarted = false;
      if (this._storeDebounce) {
        clearTimeout(this._storeDebounce);
        this._storeDebounce = undefined;
      }
      if (typeof this._unsubStore === "function") {
        this._unsubStore();
      }
      this._unsubStore = undefined;
      this._storeEventsStarted = false;
    }

    _showStatus(message) {
      this.replaceChildren();
      const status = document.createElement("div");
      status.style.cssText =
        "display:flex;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;color:var(--primary-text-color);";
      status.textContent = message;
      this.append(status);
    }

    _build() {
      this.replaceChildren();
      const table = document.createElement("hass-tabs-subpage-data-table");
      table.hass = this._hass;
      table.narrow = this._narrow;
      table.route = this._route;
      table.mainPage = true;
      table.clickable = true;
      table.hasFilters = true;
      table.filter = this._search;
      table.tabs = [{ name: "Setup Codes", path: "/setup_codes" }];
      table.searchLabel = "Search setup codes";
      table.noDataText = "No pairing-code devices yet";
      table.addEventListener("row-click", (ev) =>
        this._openDialog(ev.detail?.id)
      );
      table.addEventListener("clear-filter", () => this._clearFilters());
      table.addEventListener("search-changed", (ev) => {
        this._search = ev.detail?.value || "";
      });
      table.addEventListener("sorting-changed", (ev) => {
        writeTablePref(TABLE_SORT_KEY, ev.detail);
      });
      table.addEventListener("grouping-changed", (ev) => {
        const next = ev.detail?.value || "";
        writeTablePref(TABLE_GROUP_KEY, next);
        if (next === this._groupColumn) {
          return;
        }
        this._groupColumn = next;
        this._syncTableLayout();
      });
      table.addEventListener("collapsed-changed", (ev) => {
        writeTablePref(TABLE_COLLAPSE_KEY, ev.detail?.value || []);
      });

      const areaFilter = document.createElement("ha-filter-floor-areas");
      areaFilter.slot = "filter-pane";
      areaFilter.expanded = true;
      areaFilter.narrow = this._narrow;
      areaFilter.addEventListener("data-table-filter-changed", (ev) => {
        this._filters.area = ev.detail || {};
        this._apply();
      });
      areaFilter.addEventListener("expanded-changed", (ev) =>
        this._onFilterExpanded(ev, areaFilter)
      );

      const manufacturerFilter = document.createElement("ha-filter-states");
      manufacturerFilter.slot = "filter-pane";
      manufacturerFilter.label = "Manufacturer";
      manufacturerFilter.narrow = this._narrow;
      manufacturerFilter.states = [];
      manufacturerFilter.addEventListener("data-table-filter-changed", (ev) => {
        this._filters.manufacturer = ev.detail || {};
        this._apply();
      });
      manufacturerFilter.addEventListener("expanded-changed", (ev) =>
        this._onFilterExpanded(ev, manufacturerFilter)
      );

      const protocolFilter = document.createElement("ha-filter-states");
      protocolFilter.slot = "filter-pane";
      protocolFilter.label = "Protocol";
      protocolFilter.narrow = this._narrow;
      protocolFilter.states = [];
      protocolFilter.addEventListener("data-table-filter-changed", (ev) => {
        this._filters.protocol = ev.detail || {};
        this._apply();
      });
      protocolFilter.addEventListener("expanded-changed", (ev) =>
        this._onFilterExpanded(ev, protocolFilter)
      );

      const statusFilter = document.createElement("ha-filter-states");
      statusFilter.slot = "filter-pane";
      statusFilter.label = "Status";
      statusFilter.narrow = this._narrow;
      statusFilter.states = [
        { value: "available", label: "Available" },
        { value: "unavailable", label: "Unavailable" },
        { value: "removed", label: "Removed" },
      ];
      statusFilter.addEventListener("data-table-filter-changed", (ev) => {
        this._filters.status = ev.detail || {};
        this._apply();
      });
      statusFilter.addEventListener("expanded-changed", (ev) =>
        this._onFilterExpanded(ev, statusFilter)
      );

      const codeFilter = document.createElement("ha-filter-states");
      codeFilter.slot = "filter-pane";
      codeFilter.label = "Setup code";
      codeFilter.narrow = this._narrow;
      codeFilter.states = [
        { value: "has_code", label: "Has code" },
        { value: "no_code", label: "Missing code" },
      ];
      codeFilter.addEventListener("data-table-filter-changed", (ev) => {
        this._filters.code = ev.detail || {};
        this._apply();
      });
      codeFilter.addEventListener("expanded-changed", (ev) =>
        this._onFilterExpanded(ev, codeFilter)
      );

      table.append(
        areaFilter,
        manufacturerFilter,
        protocolFilter,
        statusFilter,
        codeFilter
      );
      this.append(table);

      this._table = table;
      this._syncTableLayout();
      this._areaFilter = areaFilter;
      this._manufacturerFilter = manufacturerFilter;
      this._protocolFilter = protocolFilter;
      this._statusFilter = statusFilter;
      this._codeFilter = codeFilter;
      this._filterEls = [
        areaFilter,
        manufacturerFilter,
        protocolFilter,
        statusFilter,
        codeFilter,
      ];
      this._syncChildHass();
      this._apply();
    }

    _syncTableLayout() {
      if (!this._table) {
        return;
      }
      this._table.narrow = this._narrow;
      const cols = columns(this);
      this._table.columns = cols;
      this._table.initialSorting = storedSorting(cols);
      this._table.initialGroupColumn = this._groupColumn;
      this._table.initialCollapsedGroups = storedCollapsed();
      this._table.style.setProperty(
        "--data-table-row-height",
        this._narrow ? "96px" : "60px"
      );
    }

    _syncChildHass() {
      if (!this._areaFilter) {
        return;
      }
      if (this._hass) {
        this._areaFilter.hass = this._hass;
      }
      this._bindAreaFilterLocalize();
    }

    _bindAreaFilterLocalize() {
      const filter = this._areaFilter;
      if (!filter) {
        return;
      }
      const hass = this._hass;
      const fallback = (key, ...args) => {
        if (key === "ui.panel.config.areas.caption") {
          const translated = hass?.localize?.(key, ...args);
          return translated && translated !== key ? translated : "Areas";
        }
        return hass?.localize?.(key, ...args) || key;
      };
      if (!filter.__setupCodesLocalizeBound) {
        filter.__setupCodesLocalizeBound = true;
        let inner = fallback;
        Object.defineProperty(filter, "_localize", {
          configurable: true,
          enumerable: true,
          get() {
            return inner;
          },
          set(fn) {
            inner = (key, ...args) => {
              try {
                const result =
                  typeof fn === "function" ? fn.call(filter, key, ...args) : "";
                if (result) {
                  return result;
                }
              } catch (_err) {
                /* custom panels may not have the config i18n context */
              }
              return fallback(key, ...args);
            };
            filter.requestUpdate?.();
          },
        });
      }
      filter._localize = fallback;
    }

    _onFilterExpanded(ev, target) {
      if (!ev.detail?.expanded) {
        return;
      }
      for (const el of this._filterEls || []) {
        if (el !== target) {
          el.expanded = false;
        }
      }
    }

    _clearFilters() {
      this._filters = {
        area: {},
        manufacturer: {},
        protocol: {},
        status: {},
        code: {},
      };
      if (this._areaFilter) {
        this._areaFilter.value = undefined;
      }
      if (this._manufacturerFilter) {
        this._manufacturerFilter.value = undefined;
      }
      if (this._protocolFilter) {
        this._protocolFilter.value = undefined;
      }
      if (this._statusFilter) {
        this._statusFilter.value = undefined;
      }
      if (this._codeFilter) {
        this._codeFilter.value = undefined;
      }
      this._apply();
    }

    _filteredDevices() {
      const availMap = availabilityByDeviceId(this._hass);
      let rows = this._devices.map((record) =>
        toRow(record, availMap, this._hass, this._labelById)
      );
      const areaValue = this._filters.area?.value || {};
      const selectedAreas = new Set(areaValue.areas || []);
      const selectedFloors = new Set(areaValue.floors || []);
      if (selectedAreas.size || selectedFloors.size) {
        rows = rows.filter((row) => {
          if (row.area_id && selectedAreas.has(row.area_id)) {
            return true;
          }
          if (!row.area_id || !selectedFloors.size) {
            return false;
          }
          const floorId = this._hass?.areas?.[row.area_id]?.floor_id;
          return Boolean(floorId && selectedFloors.has(floorId));
        });
      }

      const manufacturerValue = this._filters.manufacturer?.value || [];
      if (manufacturerValue.length) {
        rows = rows.filter((row) =>
          manufacturerValue.includes(row.manufacturer_key)
        );
      }

      const protocolValue = this._filters.protocol?.value || [];
      if (protocolValue.length) {
        rows = rows.filter((row) => protocolValue.includes(row.protocol_id));
      }

      const statusValue = this._filters.status?.value || [];
      if (statusValue.length) {
        rows = rows.filter((row) => statusValue.includes(row.status_id));
      }

      const codeValue = this._filters.code?.value || [];
      if (codeValue.length) {
        rows = rows.filter((row) => {
          const wanted = [];
          if (codeValue.includes("has_code")) {
            wanted.push(row.has_code);
          }
          if (codeValue.includes("no_code")) {
            wanted.push(!row.has_code);
          }
          return wanted.some(Boolean);
        });
      }
      return rows;
    }

    _apply() {
      if (!this._table) {
        return;
      }
      if (this._manufacturerFilter) {
        this._manufacturerFilter.states = uniqueFilterStates(
          this._devices,
          (record) => (record.manufacturer || "").trim() || "__none__",
          (record) => (record.manufacturer || "").trim() || "—"
        );
      }
      if (this._protocolFilter) {
        this._protocolFilter.states = uniqueFilterStates(
          this._devices,
          (record) => record.protocol,
          (record) => record.protocol_label || record.protocol
        );
      }
      const rows = this._filteredDevices();
      this._statusFp = statusFingerprint(
        this._hass,
        this._devices,
        this._labelById
      );
      this._table.data = rows;
      this._table.filters = Object.values(this._filters).filter(filterUsed).length;
      this._table.searchLabel = `Search ${rows.length} devices`;
    }

    _maybeRefreshStatus() {
      if (!this._table || !this._devices.length) {
        return;
      }
      const next = statusFingerprint(
        this._hass,
        this._devices,
        this._labelById
      );
      if (next === this._statusFp) {
        return;
      }
      this._apply();
    }

    _brandIconUrl(protocol) {
      const domain = PROTOCOL_BRAND_DOMAIN[protocol] || protocol;
      if (!domain || !this._brandsToken) {
        return "";
      }
      const dark = Boolean(this._hass?.themes?.darkMode);
      const file = dark ? "dark_icon.png" : "icon.png";
      const origin = this._hass?.auth?.data?.hassUrl || location.origin;
      const url = new URL(`/api/brands/integration/${domain}/${file}`, origin);
      url.searchParams.set("token", this._brandsToken);
      return url.toString();
    }

    _protocolIcon(row) {
      const src = this._brandIconUrl(row.protocol_id);
      if (!src) {
        return "";
      }
      const img = document.createElement("img");
      img.alt = row.protocol || "";
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.src = src;
      return img;
    }

    _setupCodeCell(row, compact) {
      if (!row.has_code) {
        return "—";
      }
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "display:flex;align-items:center;gap:2px;min-width:0;";
      const text = document.createElement("span");
      text.textContent = row.setup_code;
      text.style.cssText =
        "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      const size = compact ? "24px" : "36px";
      const btn = document.createElement("ha-icon-button");
      btn.label = "Copy setup code";
      btn.style.cssText = `--ha-icon-button-size:${size};flex-shrink:0;margin-inline-end:-8px;`;
      const icon = document.createElement("ha-icon");
      icon.icon = "mdi:content-copy";
      btn.append(icon);
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._copySetupCode(row.setup_code);
      });
      wrap.append(text, btn);
      return wrap;
    }

    _narrowDeviceCell(row) {
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "display:flex;flex-direction:column;gap:2px;min-width:0;padding:6px 0;box-sizing:border-box;";

      const line1 = document.createElement("div");
      line1.style.cssText =
        "display:flex;align-items:baseline;gap:8px;min-width:0;";
      const name = document.createElement("span");
      name.textContent = row.name || "Device";
      name.style.cssText =
        "font-weight:var(--ha-font-weight-medium,500);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      line1.append(name);
      const grouped = this._groupColumn;
      const secondaryStyle =
        "color:var(--secondary-text-color);font-size:var(--ha-font-size-s,12px);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
      if (grouped !== "area" && row.area && row.area !== "—") {
        const area = document.createElement("span");
        area.textContent = row.area;
        area.style.cssText = secondaryStyle;
        line1.append(area);
      }
      if (grouped !== "status" && row.status) {
        const status = document.createElement("span");
        status.textContent = row.status;
        status.style.cssText = secondaryStyle;
        line1.append(status);
      }

      const line2 = document.createElement("div");
      line2.style.cssText =
        "display:flex;align-items:baseline;gap:8px;min-width:0;color:var(--secondary-text-color);font-size:var(--ha-font-size-s,12px);";
      const meta = ["manufacturer", "model", "serial_number"]
        .filter((key) => key !== grouped)
        .map((key) => row[key])
        .filter((value) => value && value !== "—");
      if (meta.length) {
        for (const value of meta) {
          const part = document.createElement("span");
          part.textContent = value;
          part.style.cssText =
            "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          line2.append(part);
        }
      } else {
        line2.textContent = "—";
      }

      const line3 = this._setupCodeCell(row, true);
      if (typeof line3 === "string") {
        const code = document.createElement("div");
        code.textContent = line3;
        code.style.cssText = "color:var(--secondary-text-color);";
        wrap.append(line1, line2, code);
      } else {
        wrap.append(line1, line2, line3);
      }
      return wrap;
    }

    async _copySetupCode(text) {
      if (!text) {
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const el = document.createElement("textarea");
          el.value = text;
          el.setAttribute("readonly", "");
          el.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
          this.append(el);
          el.select();
          document.execCommand("copy");
          el.remove();
        }
        notify(this, "Copied to clipboard");
      } catch (_err) {
        notify(this, "Could not copy setup code");
      }
    }

    _deviceLabels(row) {
      const labels = row.label_entries;
      if (!labels?.length) {
        return "";
      }
      if (customElements.get("ha-data-table-labels")) {
        const el = document.createElement("ha-data-table-labels");
        el.labels = labels;
        el.addEventListener("click", (ev) => ev.stopPropagation());
        return el;
      }
      const wrap = document.createElement("div");
      wrap.style.cssText =
        "display:flex;flex-wrap:wrap;gap:4px;margin-top:4px;";
      wrap.addEventListener("click", (ev) => ev.stopPropagation());
      for (const label of labels) {
        const chip = document.createElement("ha-label");
        chip.dense = true;
        if (label.color) {
          chip.color = label.color;
        }
        if (label.description) {
          chip.description = label.description;
        }
        if (label.icon) {
          const icon = document.createElement("ha-icon");
          icon.slot = "icon";
          icon.icon = label.icon;
          chip.append(icon);
        }
        chip.append(document.createTextNode(label.name));
        wrap.append(chip);
      }
      return wrap;
    }

    async _ensureLabels() {
      if (this._labelsStarted || !this._hass?.callWS) {
        return;
      }
      this._labelsStarted = true;
      await this._loadLabels();
      if (this._unsubLabels || !this._hass.connection?.subscribeEvents) {
        return;
      }
      try {
        this._unsubLabels = await this._hass.connection.subscribeEvents(() => {
          clearTimeout(this._labelsDebounce);
          this._labelsDebounce = setTimeout(() => this._loadLabels(), 500);
        }, "label_registry_updated");
      } catch (_err) {
        this._labelsStarted = false;
      }
    }

    async _loadLabels() {
      if (!this._hass?.callWS) {
        return;
      }
      try {
        const labels = await this._hass.callWS({
          type: "config/label_registry/list",
        });
        const map = new Map();
        for (const entry of labels || []) {
          if (entry?.label_id) {
            map.set(entry.label_id, entry);
          }
        }
        this._labelById = map;
        this._apply();
      } catch (_err) {
        /* label registry list may be unavailable on older cores */
      }
    }

    async _ensureBrandsToken() {
      if (!this._hass?.callWS) {
        return;
      }
      const fetchToken = async () => {
        try {
          const result = await this._hass.callWS({ type: "brands/access_token" });
          const token = result?.token || "";
          if (token && token !== this._brandsToken) {
            this._brandsToken = token;
            this._apply();
          } else if (token) {
            this._brandsToken = token;
          }
        } catch (_err) {
          /* older backends may not expose brands/access_token */
        }
      };
      await fetchToken();
      if (this._brandsTimer) {
        clearInterval(this._brandsTimer);
      }
      this._brandsTimer = setInterval(fetchToken, 30 * 60 * 1000);
    }

    async _ensureStoreEvents() {
      if (this._storeEventsStarted || !this._hass?.connection?.subscribeEvents) {
        return;
      }
      this._storeEventsStarted = true;
      try {
        this._unsubStore = await this._hass.connection.subscribeEvents(() => {
          clearTimeout(this._storeDebounce);
          this._storeDebounce = setTimeout(() => this._loadDevices(), 300);
        }, STORE_EVENT);
      } catch (_err) {
        this._storeEventsStarted = false;
      }
    }

    async _loadDevices() {
      if (!this._hass?.callWS) {
        return;
      }
      if (this._loadDevicesInFlight) {
        this._loadDevicesAgain = true;
        return;
      }
      this._loadDevicesInFlight = true;
      try {
        do {
          this._loadDevicesAgain = false;
          const devices = await this._hass.callWS({
            type: "setup_codes/list",
          });
          const fp = storeFingerprint(devices);
          this._devices = devices;
          if (this._editing) {
            const next = this._devices.find((item) => item.id === this._editing.id);
            if (!next) {
              this._closeDialog();
            }
          }
          if (fp !== this._storeFp) {
            this._storeFp = fp;
            this._apply();
          } else {
            this._maybeRefreshStatus();
          }
        } while (this._loadDevicesAgain);
      } catch (err) {
        notify(this, err?.message || "Failed to load setup codes");
      } finally {
        this._loadDevicesInFlight = false;
      }
    }

    _openDialog(recordId) {
      const record = this._devices.find((item) => item.id === recordId);
      if (!record) {
        return;
      }
      this._closeDialog();
      this._editing = record;

      const overlay = document.createElement("div");
      overlay.className = "setup-codes-dialog-overlay";
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) {
          this._closeDialog();
        }
      });

      const dialog = document.createElement("div");
      dialog.className = "setup-codes-dialog";
      dialog.setAttribute("role", "dialog");
      dialog.setAttribute("aria-modal", "true");

      const title = document.createElement("h2");
      title.textContent = record.name || "Device";

      const meta = document.createElement("dl");
      const fields = [
        ["Protocol", record.protocol_label || record.protocol],
        ["Manufacturer", record.manufacturer],
        ["Model", record.model],
        ["Serial number", record.serial_number],
        ["Area", record.area_name],
        [
          "Status",
          statusLabelForRecord(
            record,
            availabilityByDeviceId(this._hass),
            this._hass
          ),
        ],
      ];
      for (const [label, value] of fields) {
        const dt = document.createElement("dt");
        dt.textContent = label;
        const dd = document.createElement("dd");
        dd.textContent = dash(value);
        meta.append(dt, dd);
      }
      if (recordInHomeAssistant(this._hass, record) && record.ha_device_id) {
        const dt = document.createElement("dt");
        dt.textContent = "Device";
        const dd = document.createElement("dd");
        const link = document.createElement("a");
        const path = `/config/devices/device/${record.ha_device_id}`;
        link.href = path;
        link.textContent = "Open in Home Assistant";
        link.addEventListener("click", (ev) => {
          ev.preventDefault();
          this._closeDialog();
          this._navigate(path);
        });
        dd.append(link);
        meta.append(dt, dd);
      }

      const inputLabel = document.createElement("label");
      const input = document.createElement("input");
      input.type = "text";
      input.autocomplete = "off";
      input.spellcheck = false;
      const isZwave = record.protocol === "zwave";
      const storedCode = String(record.setup_code || "").trim();
      const isMatterQr =
        (record.protocol || "matter") === "matter" &&
        storedCode.toUpperCase().startsWith("MT:");
      const isMatterLong =
        (record.protocol || "matter") === "matter" &&
        !isMatterQr &&
        storedCode.replace(/\D/g, "").length === 21;
      if (isZwave) {
        inputLabel.textContent = "DSK / QR";
        input.value = formatZwaveDskOrQr(record.setup_code, "");
        input.placeholder = "90… SmartStart QR or 40-digit DSK";
      } else if (isMatterQr) {
        inputLabel.textContent = "QR";
        input.value = storedCode;
        input.placeholder = "MT:… Matter QR payload";
      } else if (isMatterLong) {
        inputLabel.textContent = "Setup code";
        input.value = storedCode.replace(/\D/g, "");
        input.placeholder = "MT:… or 11/21-digit Matter pairing code";
      } else {
        inputLabel.textContent = "Setup code";
        input.value = formatSetupCode(record.protocol, record.setup_code, "");
        if ((record.protocol || "matter") === "homekit") {
          input.placeholder = "X-HM://… or 8-digit HomeKit setup code";
        } else {
          input.placeholder = "MT:… or 11/21-digit Matter pairing code";
        }
      }
      inputLabel.append(input);

      let pinLabel;
      if (isZwave || isMatterQr || isMatterLong) {
        pinLabel = document.createElement("label");
        pinLabel.textContent = isZwave ? "PIN" : "Pairing code";
        const pinInput = document.createElement("input");
        pinInput.type = "text";
        pinInput.readOnly = true;
        pinInput.autocomplete = "off";
        pinInput.spellcheck = false;
        pinInput.placeholder = isZwave
          ? "First 5 digits of the DSK"
          : "11-digit code for manual pairing";
        if (isZwave) {
          pinInput.value = zwavePinFromSetupCode(record.setup_code) || "";
        } else {
          const manual = matterPairingFromSetup(record.setup_code);
          pinInput.value = manual ? formatMatterManual(manual) : "";
        }
        pinLabel.append(pinInput);
        input.addEventListener("input", () => {
          if (isZwave) {
            pinInput.value = zwavePinFromSetupCode(input.value) || "";
          } else {
            const manual = matterPairingFromSetup(input.value);
            pinInput.value = manual ? formatMatterManual(manual) : "";
          }
        });
      }

      const notesLabel = document.createElement("label");
      notesLabel.textContent = "Notes";
      const notes = document.createElement("textarea");
      notes.rows = 3;
      notes.value = record.notes || "";
      notes.placeholder = "Optional notes for this device";
      notesLabel.append(notes);

      const error = document.createElement("div");
      error.className = "setup-codes-error";
      error.hidden = true;

      const actions = document.createElement("div");
      actions.className = "setup-codes-actions";

      const save = document.createElement("button");
      save.type = "button";
      save.className = "primary";
      save.textContent = "Save";
      save.addEventListener("click", () =>
        this._save(input.value, notes.value, error)
      );

      const close = document.createElement("button");
      close.type = "button";
      close.textContent = "Close";
      close.addEventListener("click", () => this._closeDialog());

      actions.append(save, close);

      if (!recordInHomeAssistant(this._hass, record)) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "danger";
        remove.textContent = "Delete";
        remove.addEventListener("click", () => this._deleteRecord());
        actions.append(remove);
      }

      dialog.append(title, meta);
      if (pinLabel) {
        dialog.append(pinLabel);
      }
      dialog.append(inputLabel, notesLabel, error, actions);
      overlay.append(dialog);
      this.append(overlay);
      this._dialog = overlay;
      this._injectDialogStyles();
      input.focus();
    }

    _injectDialogStyles() {
      if (this.querySelector("style[data-setup-codes]")) {
        return;
      }
      const style = document.createElement("style");
      style.dataset.setupCodes = "1";
      style.textContent = `
        .setup-codes-dialog-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.4);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .setup-codes-dialog {
          background: var(--card-background-color, var(--primary-background-color));
          color: var(--primary-text-color);
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, 0 8px 32px rgba(0,0,0,.3));
          max-width: 420px;
          width: 100%;
          padding: 20px 24px 16px;
          box-sizing: border-box;
        }
        .setup-codes-dialog h2 {
          margin: 0 0 12px;
          font-size: var(--ha-font-size-xl, 1.25rem);
          font-weight: var(--ha-font-weight-medium, 500);
        }
        .setup-codes-dialog dl {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 4px 12px;
          margin: 0 0 16px;
          font-size: var(--ha-font-size-m, 14px);
        }
        .setup-codes-dialog dt {
          color: var(--secondary-text-color);
        }
        .setup-codes-dialog dd {
          margin: 0;
        }
        .setup-codes-dialog a {
          color: var(--primary-color);
        }
        .setup-codes-dialog label {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
          font-size: var(--ha-font-size-s, 12px);
          color: var(--secondary-text-color);
        }
        .setup-codes-dialog input,
        .setup-codes-dialog textarea {
          font: inherit;
          color: var(--primary-text-color);
          background: var(--input-fill-color, var(--card-background-color));
          border: 1px solid var(--divider-color);
          border-radius: 8px;
          padding: 10px 12px;
        }
        .setup-codes-dialog textarea {
          min-height: 72px;
          resize: vertical;
        }
        .setup-codes-error {
          color: var(--error-color, #db4437);
          font-size: var(--ha-font-size-s, 12px);
          margin: 0 0 12px;
        }
        .setup-codes-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }
        .setup-codes-actions button {
          font: inherit;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          cursor: pointer;
          background: var(--secondary-background-color, var(--divider-color));
          color: var(--primary-text-color);
        }
        .setup-codes-actions button.primary {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        .setup-codes-actions button.danger {
          background: var(--error-color, #db4437);
          color: #fff;
          margin-right: auto;
        }
      `;
      this.append(style);
    }

    _closeDialog() {
      this._dialog?.remove();
      this._dialog = undefined;
      this._editing = undefined;
    }

    _navigate(path) {
      window.history.pushState(null, "", path);
      window.dispatchEvent(
        new CustomEvent("location-changed", {
          bubbles: true,
          composed: true,
          detail: { replace: false },
        })
      );
    }

    async _save(setupCode, notes, errorEl) {
      const record = this._editing;
      if (!record || !this._hass?.callWS) {
        return;
      }
      if (errorEl) {
        errorEl.hidden = true;
        errorEl.textContent = "";
      }
      const protocol = record.protocol || "matter";
      let clientError = null;
      if (protocol === "matter") {
        clientError = validateMatterManualCode(setupCode);
      } else if (protocol === "homekit") {
        clientError = validateHomekitSetupCode(setupCode);
      } else if (protocol === "zwave") {
        clientError = validateZwaveSetupCode(setupCode);
      }
      if (clientError) {
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = clientError;
        } else {
          notify(this, clientError);
        }
        return;
      }
      try {
        const updated = await this._hass.callWS({
          type: "setup_codes/set_code",
          record_id: record.id,
          setup_code: (setupCode || "").trim() || null,
          notes: (notes || "").trim() || null,
        });
        this._devices = this._devices.map((item) =>
          item.id === updated.id ? updated : item
        );
        this._storeFp = storeFingerprint(this._devices);
        this._apply();
        this._closeDialog();
        notify(this, "Saved");
      } catch (err) {
        const message = err?.message || "Failed to save";
        if (errorEl) {
          errorEl.hidden = false;
          errorEl.textContent = message;
        }
        notify(this, message);
      }
    }

    async _deleteRecord() {
      const record = this._editing;
      if (!record || !this._hass?.callWS) {
        return;
      }
      if (
        !window.confirm(
          `Delete the saved setup code for ${record.name || "this device"}? This cannot be undone.`
        )
      ) {
        return;
      }
      try {
        await this._hass.callWS({
          type: "setup_codes/delete",
          record_id: record.id,
        });
        this._devices = this._devices.filter((item) => item.id !== record.id);
        this._storeFp = storeFingerprint(this._devices);
        this._apply();
        this._closeDialog();
        notify(this, "Device removed from Setup Codes");
      } catch (err) {
        notify(this, err?.message || "Failed to delete device");
      }
    }
  }

  if (!customElements.get(TAG)) {
    customElements.define(TAG, SetupCodesPanel);
  }
})();
