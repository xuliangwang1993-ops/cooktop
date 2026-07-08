// Rebuilds ../index.html from the editable sources in this folder.
// Run from the repo root:  node src/build.js
//
// index.html is a "bundler" single-file app: the React app lives inside a
// __bundler/template <script> as a JSON string, and the dc-runtime framework lives
// (gzipped+base64) in a __bundler/manifest <script>. This script only regenerates the
// template payload from src/*; the manifest is never touched.
//
// The bundler embeds the template JSON with EVERY "/" escaped as / so that closing
// tags such as </script> inside the template can't terminate the outer <script>. We
// replicate that encoding exactly — anything else renders the app with broken {{ }} bindings.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const S = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");

const head = S("template.html");            // <!DOCTYPE>..<x-dc>markup</x-dc>\n
const logic = S("logic.js");                // logic JS (the data-dc-script content)
const meta = JSON.parse(S("meta.json"));    // { scriptOpenTag, tail }

if (logic.includes("</script>")) throw new Error("logic.js contains </script> — would break the bundle");

const fullTemplate = head + meta.scriptOpenTag + logic + meta.tail;

// Serialize like the bundler: JSON, then escape every forward slash as /.
// (JSON.stringify never emits "/" inside an escape sequence, so a blanket replace is safe.)
const encoded = JSON.stringify(fullTemplate).replace(/\//g, "\\u002F");

// Use a pristine base if present (dev), else the committed index.html (idempotent —
// the outer loader + manifest bytes never change, we only swap the template payload).
const origPath = path.join(root, "index.html.orig");
const outPath = path.join(root, "index.html");
let html = fs.readFileSync(fs.existsSync(origPath) ? origPath : outPath, "utf8");

const open = '<script type="__bundler/template">';
const i = html.indexOf(open);
if (i < 0) throw new Error("template script not found in index.html");
const contentStart = i + open.length;
const contentEnd = html.indexOf("</script>", contentStart);
if (contentEnd < 0) throw new Error("template close not found");
const region = html.slice(contentStart, contentEnd);
const lead = region.match(/^\s*/)[0];
const trail = region.match(/\s*$/)[0];
html = html.slice(0, contentStart) + lead + encoded + trail + html.slice(contentEnd);

// Safety net: verify the payload round-trips and contains no bundle-breaking sequence.
const check = JSON.parse(html.slice(contentStart, html.indexOf("</script>", contentStart)).trim());
if (check !== fullTemplate) throw new Error("round-trip mismatch — refusing to write");
fs.writeFileSync(outPath, html);
console.log("Rebuilt index.html — template", fullTemplate.length, "chars, logic", logic.length, "chars.");
