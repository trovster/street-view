# Initial Weather Default Design

## Context

The static weather scene currently loads `street-view-data/data/index.json`, moves the timeline to the latest available point, fetches that point, and applies its scene data. The page also has an HTML fallback default of day, few clouds, no rain, no snow, no wind, and no fog.

## Goal

On first load, the page should show the timeline at the beginning while remaining paused. The rendered scene should not use live weather point data for the initial image. It should use the browser's local time and timezone to choose a day or night layer, with a calm default weather state.

## Initial Scene Rules

- Use `day` when the browser local hour is greater than or equal to `7` and less than `21`.
- Use `night-full` outside that range.
- Use the `default` base layer.
- Show `few` clouds.
- Set rain to `none`.
- Set snow to `none`.
- Set wind to `none`.
- Disable fog.

## Timeline Behavior

The weather timeline should be visible after the manifest loads, with the range positioned at index `0`. Playback must remain stopped and the play button must remain in its "Play weather timeline" state. The initial timeline position should not automatically fetch and apply the first weather point.

When the user interacts with the timeline range or presses play, existing timeline behavior should continue to use the manifest-backed point files.

## Implementation Shape

Add a small helper that returns the browser-time default scene from a `Date` instance. Use that helper during startup before the manifest is loaded, so the page renders the requested default immediately. Change manifest loading so it initializes the timeline range at index `0` and shows the timeline without selecting a weather point automatically.

Keep the existing `selectTimelinePoint`, playback, manual option input, reset, and random behavior intact.

## Testing

Extend the existing Node VM harness in `scripts/test.mjs` to verify:

- Startup leaves the timeline at index `0`.
- Startup does not start playback.
- Browser local hours from `07:00` through `20:59` choose the day scene.
- Browser local hours before `07:00` and from `21:00` onward choose the night scene.
- Startup defaults include few clouds, no rain, no snow, no wind, no fog, and the default base layer.
