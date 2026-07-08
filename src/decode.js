// Regenerates the editable sources in this folder FROM ../index.html.
// Run from the repo root:  node src/decode.js
// You normally don't need this — edit template.html / logic.js and run build.js. It's here
// so the sources can always be recovered from the shipped index.html if they drift.
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extract(type) {
  const open = '<script type="' + type + '">';
  const i = html.indexOf(open);
  if (i < 0) throw new Error("missing " + type);
  const start = i + open.length;
  const end = html.indexOf("</script>", start);
  return html.slice(start, end).trim();
}

const tpl = JSON.parse(extract("__bundler/template"));   // full HTML document string
const i = tpl.indexOf('<script type="text/x-dc"');
const gt = tpl.indexOf(">", i);
const end = tpl.indexOf("</script>", gt);

fs.writeFileSync(path.join(__dirname, "template.html"), tpl.slice(0, i));                     // markup
fs.writeFileSync(path.join(__dirname, "logic.js"), tpl.slice(gt + 1, end));                   // logic
fs.writeFileSync(path.join(__dirname, "meta.json"), JSON.stringify({ scriptOpenTag: tpl.slice(i, gt + 1), tail: tpl.slice(end) }, null, 0));
console.log("Wrote template.html, logic.js, meta.json from index.html.");
