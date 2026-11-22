/**
 * Printable backup sheet for the Setup Codes panel.
 *
 * This file only does layout. The panel hands it cards that are already
 * prepared (device name, setup code text, QR code as an SVG string) and gets
 * back a standalone HTML document: a grid of QR codes per page that is sized
 * for A4 or US Letter and can be printed or saved as a PDF from the browser's
 * print dialog.
 *
 * The document is opened in its own window so Home Assistant's UI never ends
 * up on the printout, and nothing is uploaded or written to disk.
 */
(function (global) {
  "use strict";

  const PAPERS = {
    a4: { label: "A4", css: "A4", width: 210, height: 297 },
    letter: { label: "Letter", css: "letter", width: 215.9, height: 279.4 },
  };
  const LAYOUTS = {
    12: { columns: 3, rows: 4 },
    16: { columns: 4, rows: 4 },
  };
  const DEFAULT_PAPER = "a4";
  const DEFAULT_PER_PAGE = 12;

  const PAGE_MARGIN_MM = 10;
  const HEADER_MM = 8;
  // Printers disagree by a fraction of a millimetre. Without some slack a page
  // can spill over and leave a blank sheet between every page.
  const PAGE_SLACK_MM = 1;
  // Height kept free under the QR code for name, protocol and the code text.
  const TEXT_RESERVE_MM = 28;
  const MAX_QR_MM = 40;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  function mm(value) {
    return `${Math.round(value * 100) / 100}mm`;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function localDate(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  function resolveOptions(options) {
    const paperKey = PAPERS[options?.paper] ? options.paper : DEFAULT_PAPER;
    const perPage = LAYOUTS[options?.perPage]
      ? Number(options.perPage)
      : DEFAULT_PER_PAGE;
    const paper = PAPERS[paperKey];
    const { columns, rows } = LAYOUTS[perPage];
    const printWidth = paper.width - 2 * PAGE_MARGIN_MM;
    const printHeight = paper.height - 2 * PAGE_MARGIN_MM - PAGE_SLACK_MM;
    const cellWidth = printWidth / columns;
    const cellHeight = (printHeight - HEADER_MM) / rows;
    const qrSize =
      Math.floor(
        Math.min(cellWidth - 8, cellHeight - TEXT_RESERVE_MM, MAX_QR_MM) * 10
      ) / 10;
    return {
      paperKey,
      paper,
      perPage,
      columns,
      rows,
      printWidth,
      printHeight,
      qrSize,
    };
  }

  function styles(layout) {
    const roomy = layout.perPage === 12;
    const mono =
      'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", "DejaVu Sans Mono", monospace';
    return `
@page { size: ${layout.paper.css} portrait; margin: ${PAGE_MARGIN_MM}mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body {
  margin: 0;
  background: #fff;
  color: #000;
  font: 9pt/1.25 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
.page {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.page + .page { break-before: page; page-break-before: always; }
.head {
  flex: none;
  height: ${HEADER_MM}mm;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 4mm;
  white-space: nowrap;
  font-size: 7pt;
  color: #444;
}
.head strong { font-size: 10pt; color: #000; }
.head .warn { flex: 1 1 auto; text-align: center; overflow: hidden; text-overflow: ellipsis; }
.grid {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(${layout.columns}, minmax(0, 1fr));
  grid-template-rows: repeat(${layout.rows}, minmax(0, 1fr));
  border-top: 0.25mm dashed #999;
  border-left: 0.25mm dashed #999;
}
.card {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 3mm 2mm 2mm;
  border-right: 0.25mm dashed #999;
  border-bottom: 0.25mm dashed #999;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1mm;
  break-inside: avoid;
}
.qr {
  flex: none;
  width: ${mm(layout.qrSize)};
  height: ${mm(layout.qrSize)};
  display: flex;
  align-items: center;
  justify-content: center;
}
.qr svg { display: block; width: 100%; height: 100%; shape-rendering: crispEdges; }
.qr.none {
  border: 0.25mm dashed #aaa;
  color: #666;
  font-size: 7pt;
  padding: 2mm;
}
.name {
  max-width: 100%;
  font-weight: 700;
  font-size: ${roomy ? "9pt" : "8pt"};
  line-height: 1.15;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}
.proto {
  font-size: 6.5pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #555;
}
.secret {
  max-width: 100%;
  font-family: ${mono};
  font-weight: 700;
  font-size: ${roomy ? "11pt" : "9.5pt"};
  line-height: 1.15;
  overflow-wrap: anywhere;
}
.secret.long { font-size: ${roomy ? "8pt" : "7pt"}; }
.detail {
  max-width: 100%;
  font-family: ${mono};
  font-size: ${roomy ? "6.5pt" : "6pt"};
  line-height: 1.2;
  color: #444;
  overflow-wrap: anywhere;
}
.toolbar { display: none; }
@media screen {
  body { background: #d9dce1; }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: #fff;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
    font-size: 13px;
  }
  .toolbar .note { flex: 1 1 280px; color: #444; }
  .toolbar button {
    font: inherit;
    padding: 7px 14px;
    border: 1px solid #8a8f98;
    border-radius: 6px;
    background: #fff;
    color: #111;
    cursor: pointer;
  }
  .toolbar button.primary { background: #03a9f4; border-color: #03a9f4; color: #fff; }
  main { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 16px; }
  .page {
    flex: none;
    width: ${mm(layout.paper.width)};
    height: ${mm(layout.paper.height)};
    padding: ${PAGE_MARGIN_MM}mm;
    background: #fff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }
}
@media print {
  .toolbar { display: none; }
  main { display: block; padding: 0; }
  .page {
    width: ${mm(layout.printWidth)};
    height: ${mm(layout.printHeight)};
    padding: 0;
    box-shadow: none;
  }
}`;
  }

  function cardHtml(card) {
    const svg = typeof card.qrSvg === "string" ? card.qrSvg.trim() : "";
    // The SVG comes from the panel's own QR encoder, never from user input.
    const qr = /^<svg[\s>]/.test(svg)
      ? `<div class="qr">${svg}</div>`
      : '<div class="qr none">No QR code stored</div>';
    const lines = String(card.secret == null ? "" : card.secret).split("\n");
    const long = lines.some((line) => line.length > 16);
    const secret = lines.map(esc).join("<br>");
    return [
      '<article class="card">',
      qr,
      `<div class="name">${esc(card.name)}</div>`,
      card.protocol ? `<div class="proto">${esc(card.protocol)}</div>` : "",
      `<div class="secret${long ? " long" : ""}">${secret}</div>`,
      card.detail ? `<div class="detail">${esc(card.detail)}</div>` : "",
      "</article>",
    ].join("");
  }

  function pageHtml(cards, index, total, layout, generated, count) {
    const slots = layout.columns * layout.rows;
    const cells = cards.map(cardHtml);
    while (cells.length < slots) {
      cells.push('<div class="card"></div>');
    }
    return [
      '<section class="page">',
      '<header class="head">',
      "<strong>Setup Codes backup</strong>",
      '<span class="warn">Contains device pairing codes. Keep this page private.</span>',
      `<span>${esc(generated)} · ${count} ${count === 1 ? "device" : "devices"} · Page ${index + 1} of ${total}</span>`,
      "</header>",
      `<div class="grid">${cells.join("")}</div>`,
      "</section>",
    ].join("");
  }

  /**
   * @param {Array<{name: string, protocol?: string, secret: string, detail?: string, qrSvg?: string|null}>} cards
   * @param {{perPage?: 12|16, paper?: "a4"|"letter", generated?: string}} options
   */
  function buildDocument(cards, options) {
    const layout = resolveOptions(options);
    const generated = options?.generated || localDate(new Date());
    const slots = layout.columns * layout.rows;
    const total = Math.max(1, Math.ceil(cards.length / slots));
    const pages = [];
    for (let index = 0; index < total; index += 1) {
      pages.push(
        pageHtml(
          cards.slice(index * slots, (index + 1) * slots),
          index,
          total,
          layout,
          generated,
          cards.length
        )
      );
    }
    const note = `${layout.perPage} per page · ${layout.paper.label} · ${total} ${total === 1 ? "page" : "pages"}. Choose “Save as PDF” as the destination to keep a digital copy.`;
    const html = [
      "<!doctype html>",
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="robots" content="noindex">',
      `<title>Setup Codes backup ${esc(generated)}</title>`,
      `<style>${styles(layout)}</style>`,
      "</head><body>",
      '<div class="toolbar">',
      '<button type="button" class="primary" id="sc-print">Print / Save as PDF</button>',
      '<button type="button" id="sc-close">Close</button>',
      `<span class="note">${esc(note)}</span>`,
      "</div>",
      `<main>${pages.join("")}</main>`,
      "</body></html>",
    ].join("");
    return { html, pages: total, perPage: layout.perPage, paper: layout.paperKey };
  }

  /** Write the document into an already-open window and start printing. */
  function show(win, html, options) {
    const autoPrint = !options || options.autoPrint !== false;
    win.document.open();
    win.document.write(html);
    win.document.close();
    try {
      // The sheet holds secrets and needs no access back to Home Assistant.
      win.opener = null;
    } catch (_err) {
      /* ignore */
    }
    win.document
      .getElementById("sc-print")
      ?.addEventListener("click", () => win.print());
    win.document
      .getElementById("sc-close")
      ?.addEventListener("click", () => win.close());
    if (autoPrint) {
      win.setTimeout(() => {
        win.focus();
        win.print();
      }, 300);
    }
  }

  global.SetupCodesBackup = {
    PAPERS,
    LAYOUTS,
    DEFAULT_PAPER,
    DEFAULT_PER_PAGE,
    buildDocument,
    show,
  };
})(window);
