# Screenshots

The README embeds `docs/screenshot.png`.

To refresh it against a running GUI:

```sh
# Chrome/Edge must be started with --remote-debugging-port=9222
node capture.mjs 9222 'http://127.0.0.1:3080/?token=<printed token>' docs/screenshot.png
```

`capture.mjs` dismisses the first-run notice, opens a session, opens the skill
bar, and captures the viewport.

Keep the image reasonably small (a 1440x900 viewport is enough) and avoid
including anything private in the captured session list.
