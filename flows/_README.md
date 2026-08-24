Marketing flows for the App Store assets.

Coordinates and selectors here were derived from the app's own argent flows in
`.argent/flows` (`tab-tour.yaml`, `triage-new-issue.yaml`), which were recorded
against Beacon on an iPhone-class simulator. Prefer `text:`/`id:` selectors;
a normalized coordinate is a fallback and every one of them carries an `echo:`
saying why it is there, so a future reader knows what to re-resolve when it breaks.

Device id is injected by `argent flow run --device <udid>` - never hardcode a udid.
