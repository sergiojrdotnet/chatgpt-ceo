import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
export const historyUri = "ui://ceo/coordination-history/v1.html";
export const historyMime = "text/html;profile=mcp-app";
const script = readFileSync(
  new URL("../ui/history.js", import.meta.url),
  "utf8",
);
const style = readFileSync(
  new URL("../ui/history.css", import.meta.url),
  "utf8",
);
const hash = (text: string) =>
  createHash("sha256").update(text).digest("base64");
export const historyHtml = readFileSync(
  new URL("../ui/history.html", import.meta.url),
  "utf8",
)
  .replace(
    "<!--CSP-->",
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'sha256-${hash(style)}'; connect-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'">`,
  )
  .replace("<!--STYLE-->", `<style>${style}</style>`)
  .replace("<!--SCRIPT-->", `<script>${script}</script>`);
export const historyMeta = {
  ui: {
    prefersBorder: true,
    csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
  },
};
