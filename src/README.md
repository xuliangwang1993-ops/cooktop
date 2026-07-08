# Editing the Cooktop app

`index.html` (at the repo root) is a **single-file bundled app**: the UI template lives
inside a `__bundler/template` `<script>` as a JSON string, and the "dc-runtime" framework
(React template compiler) lives gzipped+base64 in a `__bundler/manifest` `<script>`. Because
the app runs on in-browser Babel + CDN React, `index.html` is what GitHub Pages serves — but
it is a compiled artifact and painful to edit by hand.

This folder holds the **editable sources** and a build step so you never hand-edit the blob.

## Files

- `template.html` — the UI markup (`<x-dc>` template): `{{ expr }}` interpolation,
  `<sc-if>`, `<sc-for>`, `onclick="{{ handler }}"`, etc. Bound against `renderVals()`.
- `logic.js` — the app logic: `class Component extends DCLogic` (state, methods, `renderVals()`).
- `meta.json` — the opening `<script>` tag + document tail, kept verbatim.
- `build.js` — regenerates `../index.html` from the three files above.
- `decode.js` — the reverse: regenerates these sources from `../index.html` (recovery only).

## Workflow

```
# edit src/template.html and/or src/logic.js, then:
node src/build.js
# open index.html (or serve it) to verify
```

`build.js` replaces only the template payload; the manifest/runtime is untouched. It
re-encodes the template exactly the way the original bundler does (every `/` escaped as
`/`) — this matters: any other escaping renders the app with unresolved `{{ }}`
bindings.

## What the live-DeepSeek change added

- `logic.js`: runtime DeepSeek key handling (localStorage `cooktop_deepseek_key`, never in
  code), an optional Worker URL (`cooktop_worker_url`), and `sendMission()` which calls the
  DeepSeek `chat/completions` API with the meeting context and appends the real reply.
- `template.html`: a real `<input>` in the Mission Room (was a static placeholder), a live
  transcript (`liveMsgsView`), a "thinking" indicator, and a Settings card to set/clear the
  key and Worker URL.
- `../worker/` — optional Cloudflare Worker proxy (Option ②) that holds the key server-side.
