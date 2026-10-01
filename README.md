# dsh-client-ui-skill-bar

A game-style skill bar for the **DSH** (DeepSeek Harness) web GUI: every
user-invocable skill of the current session as a card you can search, favorite,
and **click or drag to cast** into the composer as `/<name>`.

Built for the case where the catalog is bigger than your memory: you browse it,
you do not recall it.

[中文说明](README.zh.md)

![Skill bar open above the composer](docs/screenshot.png)

## What it does

| Surface | Behaviour |
|---|---|
| Composer tool row | A **Skills** button with the usable-skill count; click to open/close the panel. |
| Above the composer | The panel: search box, `All / Favorites / Recent` views, a responsive card grid. |
| A card | Display label (built-in or configured), the literal `/<kebab-name>`, the skill's own description, tags, and a sent-count mastery row. |

- **Click a card** appends `/skill-name ` to the composer draft — it never
  overwrites what you already typed.
- **Drag a card onto the composer** casts it too: a ghost follows the pointer and
  the composer highlights as the drop target. Card text is unselectable, so a
  drag never turns into a text selection.
- **Counting follows the send, not the insert.** A cast is *pending* (the card
  says so) and only counts once that token leaves the draft, i.e. you actually
  sent the message. Insert then delete: not counted.
- Casting is exactly the shipped gesture: the literal `/name` text is what makes
  the Host inject the skill body through its `dsh-tool-skill` pre-step listener.
  **Nothing is auto-sent** — you press Enter.
- Opening the panel focuses the search box; casting hands focus back to the
  composer. Keyboard: `Enter` cast, `↑`/`↓` move, `Esc` close.
- Favorites, recents and sent counts live in the browser's `localStorage`. They
  are presentation only: the plugin never writes a skill file and never changes
  what the agent sees.

## Compatibility

- DSH web surface (the desktop app and the `web` profile). Client-only.
- **Runtime contract: `react` + `react/jsx-runtime`** — the two modules every DSH
  client plugin can rely on. No internal SDK package, no CSS build, no bundler
  dependency, no transitive `import`.
- Verified against DSH `0.2.0-rc.2` (Electron desktop and `dsh web`).
- It relies on documented Remotes/slots (`skills/list`,
  `conversation.input.left`, `conversation.input.dock`, and the `inputActions` /
  `useInput` slot props). A future DSH release may rename them — that is this
  plugin's one upgrade risk, and it fails closed: the panel reports the catalog
  error instead of breaking the composer.

## Install

The plugin is a normal npm package with a `dsh.client` declaration. The Host
mounts it from a profile's Loader patch, exactly like a bundled UI plugin.

### 1. Get the code

```sh
git clone https://github.com/<you>/dsh-client-ui-skill-bar.git
```

Or `npm install dsh-client-ui-skill-bar` if you prefer to mount it from a package
specifier.

### 2. Mount it in your profile

Add an `insert` row to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`
(`%USERPROFILE%\.dsh\profiles\desktop\cordis.patch.yml` on Windows):

```yaml
- insert:
    - id: dsh-client-ui-skill-bar
      name: 'C:\path\to\dsh-client-ui-skill-bar\lib\index.js'
      config:
        label: Skills
        cooldownMs: 900
        maxHeight: 420
        labels:
          skill-creator: Create a skill
```

`name` **must point at the entry file**, not at the directory: a patch insert
name is imported as an ES module, and Node rejects directory imports
(`ERR_UNSUPPORTED_DIR_IMPORT`). Absolute paths become file URLs in the patch
loader; a bare package specifier also works when the package resolves from the
profile.

### 3. Restart the app

A profile's patch layer is composed at process start, so restart the DSH app (or
the `dsh web` process) once. The panel then appears above the composer in every
session.

## Configuration

All fields are optional; the defaults are shown.

| Field | Default | Meaning |
|---|---|---|
| `label` | localized ("技能栏" / "Skills") | Composer button text. |
| `cooldownMs` | `900` | Per-skill anti-double-cast window, in milliseconds. |
| `maxHeight` | `420` | Panel height budget, in pixels. |
| `labels` | built-in map | Per-skill display name, keyed by the exact skill name. |
| `descriptions` | the skill's own | Per-skill description override, keyed by the exact skill name. |

```yaml
      config:
        labels:
          skill-creator: 创建技能
        descriptions:
          skill-creator: 写新 skill 时用
```

## Why skill names look like that

A skill's `name` is its invocation id and must be kebab-case ASCII
(`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`), so readability is a **display** concern:

1. `config.labels` in your profile patch;
2. the plugin's built-in map;
3. the raw name.

Search matches the display label, the skill name, **and** the description. The
original `/<name>` stays visible on every card, because that is what the Host
resolves.

## Where skills live

The panel reads the session catalog through the Host's `skills/list` Remote,
which serves the merged provider registry. Local skills are `SKILL.md` files
(YAML frontmatter + Markdown body, optional `references/` and `scripts/`, or a
flat `*.md`) discovered under:

- `<project>/.dsh/skills`
- `<project>/.agents/skills`
- `customSkillDirs` from the profile patch / settings
- `$DSH_HOME/skills`
- `$DSH_AGENTS_HOME/skills` (default `~/.agents/skills`)
- the bundled skill directory of the active agent preset

Editing a `SKILL.md` takes effect on the next catalog read — no restart. Do not
rename the `name` field: `/name` invocations would stop resolving.

## Development

There is no build step: `lib/client.js` is the artifact, and it is committed,
because the DSH client module system evaluates it as a plain classic script. What
a release needs is an artifact gate, which is what `build.mjs` is.

```sh
npm install                 # react + react-dom, for the tests

npm test                    # artifact gate + offline behaviour test
node build.mjs --check      # artifact gate only

# Real-page verification against a running GUI (needs Chrome/Edge started with
# --remote-debugging-port=9222, plus the token URL the GUI printed):
node browser-check.mjs 9222 'http://127.0.0.1:3080/?token=...' out.png
node capture.mjs 9222 'http://127.0.0.1:3080/?token=...' docs/screenshot.png
```

`npm test` needs React. It resolves it from `DSH_REACT_DIR`, then
`$DSH_HOME/profiles/node_modules`, then this package's own `node_modules`:

```sh
DSH_REACT_DIR=/path/to/dsh/profiles/node_modules npm test
```

### Layout

| Path | Role |
|---|---|
| `lib/index.js` | Host half — an empty `apply`, so the plugin occupies a Loader entry. |
| `lib/client.js` | The browser half: one artifact, nothing required beyond React. |
| `build.mjs` | Artifact gate: parses, checks the module id, the require allowlist, the packaged files, and the documented regions. |
| `smoke-test.mjs` | Offline behaviour test (fake Cordis context + `react-dom/server`). |
| `browser-check.mjs` | Real-page verification over CDP, driving the real input pipeline. |
| `capture.mjs` | Screenshot helper for the README. |

`lib/client.js` is organised as `//#region` blocks (`locale`, `icons`, `storage`,
`store`, `match`, `style`, `ui`, `catalog`, `components`, `index`); the artifact
gate asserts all of them are present.

### Sharp edges when writing a DSH plugin

These cost real debugging time; they are written down so the next person skips
them.

1. **A patch `insert.name` is an ES module specifier.** Point it at the entry
   file, never the directory (`ERR_UNSUPPORTED_DIR_IMPORT`).
2. **The bundle's registered `id` must equal the package name the Host resolves.**
   Mounted by path, that name is the **directory name** — not the npm scope you
   may have intended. A mismatch fails with
   `loaded without registering "<id>" via __ModuleLoader__.load`.
3. **`ctx.config` is not a plain property in Cordis 4.** Reading it without the
   declarative inject throws `cannot get property "config" without inject`; read
   it behind a try/catch and fall back to defaults.
4. **A component with hooks must not `return null` mid-render.** The slot host
   turns that shape into a React hook-state error at open time. Split it into a
   thin seat (subscribes to the open flag, returns `null`) and a body that mounts
   and unmounts for real.
5. **Do not publish to a store the same component subscribes to from inside an
   effect.** It lands in React's commit phase; defer it one microtask.
6. **Verify every theme token exists.** An unknown token resolves to `unset`
   silently, which in dark mode means light-on-light text.
7. **`--dsw-alias-bg-l1/l2/l3` do not exist** in `0.2.0-rc.2`; carry selection
   with border color instead of a background fill.

## Known limitations

- Only **user-invocable** skills are listed (the Host's `skills/list` filters that
  way), so a `disable-model-invocation` skill shows up here — this panel is one
  of its few entry points.
- Casting writes the whole draft (`setDraft`), so the caret lands at the end.
  Nothing is auto-sent.
- The catalog is read per session; a session that is not open surfaces a read
  error inside the panel.
- Disabling or uninstalling the plugin leaves `dsh.skillBar.v1.*` keys in
  `localStorage` behind (clear them manually if that matters).

## License

MIT — see [LICENSE](LICENSE).
