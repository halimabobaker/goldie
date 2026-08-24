Marketing flows for the App Store assets. App-specific, so `*.yaml` here is
untracked; each app brings its own set, referenced from its config's `scenes`.

If the app repo has recorded argent flows (`.argent/flows/`), derive selectors
and coordinates from them; they are proven to replay. Prefer `text:`/`id:`
selectors. A normalized coordinate is a fallback and should carry an `echo:`
saying why it is there, so a future reader knows what to re-resolve when it
breaks.

Device id is injected by `argent flow run --device <udid>` - never hardcode a
udid.
