import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const html = readFileSync("index.html", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const weatherJs = readFileSync("assets/js/weather.js", "utf8");
const weatherCss = readFileSync("assets/css/weather.css", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const gitmodules = existsSync(".gitmodules") ? readFileSync(".gitmodules", "utf8") : "";
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const iconDirectory = "assets/icons/meteocons";
const weatherFetchScript = "scripts/fetch-weather-data.mjs";
const icons = [
  ...new Set(
    [...html.matchAll(/data-meteocon="([^"]+)"/g)].map((match) => match[1]),
  ),
].sort();

const failures = [];

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  add(...names) {
    names.forEach((name) => this.classes.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.classes.delete(name));
  }

  toggle(name, force) {
    const shouldAdd = force ?? !this.classes.has(name);

    if (shouldAdd) {
      this.classes.add(name);
    } else {
      this.classes.delete(name);
    }

    return shouldAdd;
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement {
  constructor({ dataset = {}, value = "", checked = false } = {}) {
    this.attributes = new Map();
    this.checked = checked;
    this.classList = new FakeClassList();
    this.dataset = dataset;
    this.hidden = false;
    this.listeners = new Map();
    this.queryResults = new Map();
    this.src = "";
    this.textContent = "";
    this.value = value;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];

    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event) {
    const eventWithTarget = {
      ...event,
      currentTarget: this,
      target: event.target ?? this,
    };

    (this.listeners.get(event.type) ?? []).forEach((listener) => listener.call(this, eventWithTarget));
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }

  querySelector(selector) {
    return this.queryResults.get(selector) ?? null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
}

class FakeFormData {
  constructor(form) {
    this.values = new Map(
      Object.entries(form.elements)
        .filter(([, element]) => element.type !== "checkbox" || element.checked)
        .map(([name, element]) => [name, element.value]),
    );
  }

  get(name) {
    return this.values.get(name);
  }

  has(name) {
    return this.values.has(name);
  }
}

function createWeatherHarness({ now = "2026-05-27T12:00:00" } = {}) {
  const activeIntervals = new Set();
  const fetchCalls = new Map();
  const form = new FakeElement();
  const stage = new FakeElement();
  const timeline = new FakeElement();
  const timelinePlayButton = new FakeElement();
  const timelinePlayIcon = new FakeElement();
  const timelineRange = new FakeElement({ value: "0" });
  const timelineOutput = new FakeElement();
  const resetButton = new FakeElement();
  const randomButton = new FakeElement();
  const popovers = [new FakeElement(), new FakeElement(), new FakeElement()];
  const layerNames = [
    "sky-day",
    "sky-sunrise",
    "sky-sunset",
    "sky-night",
    "sun-full",
    "sun-top-half",
    "moon-full",
    "moon-crescent",
    "stars-few",
    "stars-many",
    "clouds-few",
    "clouds-many",
    "rain-light",
    "rain-heavy",
    "snow-light",
    "snow-heavy",
    "wind-light-clouds-few",
    "wind-light-clouds-many",
    "wind-strong-clouds-few",
    "wind-strong-clouds-many",
    "fog",
    "turbine",
    "turbine-blades",
    "lighting",
    "wet-road",
    "base",
    "base-snow",
  ];
  const layers = layerNames.map((name) => new FakeElement({ dataset: { layer: name } }));
  const icons = [new FakeElement({ dataset: { meteocon: "clear-day" } })];
  const points = [
    { time: "2026-05-26T00:00", file: "2026/05/26/2026-05-26T00-00.json" },
    { time: "2026-05-26T00:15", file: "2026/05/26/2026-05-26T00-15.json" },
  ];
  let intervalId = 0;
  const NativeDate = Date;
  class FakeDate extends NativeDate {
    constructor(...args) {
      if (args.length === 0) {
        super(now);
        return;
      }

      super(...args);
    }

    static now() {
      return new NativeDate(now).getTime();
    }
  }

  form.elements = {
    baseLayer: new FakeElement({ value: "default" }),
    scene: new FakeElement({ value: "day" }),
    clouds: new FakeElement({ value: "few" }),
    rain: new FakeElement({ value: "none" }),
    snow: new FakeElement({ value: "none" }),
    wind: new FakeElement({ value: "none" }),
    fog: new FakeElement({ checked: false, value: "on" }),
  };
  form.elements.fog.type = "checkbox";
  form.queryResults.set("[data-reset-scene]", resetButton);
  form.queryResults.set("[data-random-scene]", randomButton);

  const document = {
    querySelector(selector) {
      return new Map([
        ["#weather-form", form],
        [".stage", stage],
        [".weather-timeline", timeline],
        ["[data-weather-play]", timelinePlayButton],
        ["[data-weather-play-icon]", timelinePlayIcon],
        ["[data-weather-range]", timelineRange],
        ["[data-weather-output]", timelineOutput],
      ]).get(selector) ?? null;
    },
    querySelectorAll(selector) {
      return new Map([
        ["[data-layer]", layers],
        ["[data-meteocon]", icons],
        ["[popover]", popovers],
      ]).get(selector) ?? [];
    },
  };
  const window = {
    clearInterval(id) {
      activeIntervals.delete(id);
    },
    location: {
      href: "https://example.test/",
    },
    setInterval() {
      intervalId += 1;
      activeIntervals.add(intervalId);

      return intervalId;
    },
  };
  const context = {
    Date: FakeDate,
    Error,
    FormData: FakeFormData,
    Intl,
    Math,
    URL,
    document,
    fetch: async (url) => {
      const urlString = String(url);

      fetchCalls.set(urlString, (fetchCalls.get(urlString) ?? 0) + 1);

      return {
        ok: true,
        json: async () => {
          if (urlString.endsWith("index.json")) {
            return { points };
          }

          return {
            scene: {
              baseLayer: "default",
              scene: "day",
              clouds: "few",
              rain: "none",
              snow: "none",
              wind: "none",
              fog: false,
            },
          };
        },
      };
    },
    window,
  };

  return {
    activeIntervalCount: () => activeIntervals.size,
    context,
    fetchCountFor: (file) => Array.from(fetchCalls.entries())
      .filter(([url]) => url.includes(file))
      .reduce((total, [, count]) => total + count, 0),
    flushAsync: async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    },
    layerIsVisible: (name) => !layers.find((layer) => layer.dataset.layer === name)?.classList.contains("is-hidden"),
    popovers,
    timelinePlayButton,
    timelineRange,
  };
}

async function runInitialDefaultRegression() {
  const regressionFailures = [];
  const dayHarness = createWeatherHarness({ now: "2026-05-27T12:00:00" });
  const earlyHarness = createWeatherHarness({ now: "2026-05-27T06:59:00" });
  const lateHarness = createWeatherHarness({ now: "2026-05-27T21:00:00" });

  vm.runInNewContext(weatherJs, dayHarness.context, { filename: "assets/js/weather.js" });
  await dayHarness.flushAsync();

  if (dayHarness.timelineRange.value !== "0") {
    regressionFailures.push("Initial weather timeline does not start at the first point.");
  }

  if (dayHarness.activeIntervalCount() !== 0) {
    regressionFailures.push("Initial weather timeline starts playback instead of staying paused.");
  }

  if (dayHarness.fetchCountFor("2026/05/26/2026-05-26T00-00.json") !== 0) {
    regressionFailures.push("Initial weather scene fetches and applies the first timeline point.");
  }

  if (!dayHarness.layerIsVisible("sky-day") || dayHarness.layerIsVisible("sky-night")) {
    regressionFailures.push("Browser daytime startup does not show the day scene.");
  }

  for (const [name, isVisible] of Object.entries({
    base: true,
    "base-snow": false,
    "clouds-few": true,
    "rain-light": false,
    "rain-heavy": false,
    "snow-light": false,
    "snow-heavy": false,
    fog: false,
  })) {
    if (dayHarness.layerIsVisible(name) !== isVisible) {
      regressionFailures.push(`Initial default layer ${name} visibility is incorrect.`);
    }
  }

  vm.runInNewContext(weatherJs, earlyHarness.context, { filename: "assets/js/weather.js" });
  await earlyHarness.flushAsync();

  if (!earlyHarness.layerIsVisible("sky-night") || earlyHarness.layerIsVisible("sky-day")) {
    regressionFailures.push("Browser startup before 07:00 does not show the night scene.");
  }

  vm.runInNewContext(weatherJs, lateHarness.context, { filename: "assets/js/weather.js" });
  await lateHarness.flushAsync();

  if (!lateHarness.layerIsVisible("sky-night") || lateHarness.layerIsVisible("sky-day")) {
    regressionFailures.push("Browser startup from 21:00 does not show the night scene.");
  }

  return regressionFailures;
}

async function runPopoverPlaybackRegression() {
  const regressionFailures = [];
  const harness = createWeatherHarness();
  const [, aboutPopover] = harness.popovers;

  vm.runInNewContext(weatherJs, harness.context, { filename: "assets/js/weather.js" });
  await harness.flushAsync();

  harness.timelinePlayButton.click();
  await harness.flushAsync();

  if (harness.activeIntervalCount() !== 1) {
    regressionFailures.push("Regression setup failed: the timeline did not start before opening a popover.");
  }

  aboutPopover.dispatchEvent({ type: "toggle", oldState: "closed", newState: "open" });

  if (harness.activeIntervalCount() !== 0) {
    regressionFailures.push("Opening a popover does not pause active timeline playback.");
  }

  aboutPopover.dispatchEvent({ type: "toggle", oldState: "open", newState: "closed" });
  await harness.flushAsync();

  if (harness.activeIntervalCount() !== 1) {
    regressionFailures.push("Closing a popover does not restart timeline playback that was previously running.");
  }

  harness.timelinePlayButton.click();

  if (harness.activeIntervalCount() !== 0) {
    regressionFailures.push("Regression setup failed: the timeline did not stop before the paused-popover check.");
  }

  aboutPopover.dispatchEvent({ type: "toggle", oldState: "closed", newState: "open" });
  aboutPopover.dispatchEvent({ type: "toggle", oldState: "open", newState: "closed" });
  await harness.flushAsync();

  if (harness.activeIntervalCount() !== 0) {
    regressionFailures.push("Closing a popover restarts timeline playback even when it was not running before opening.");
  }

  return regressionFailures;
}

failures.push(...await runInitialDefaultRegression());
failures.push(...await runPopoverPlaybackRegression());

if (weatherJs.includes("basmilius.github.io/meteocons")) {
  failures.push("weather.js still references the hosted Meteocons CDN.");
}

if (!weatherJs.includes(`${iconDirectory}/`)) {
  failures.push(`weather.js does not point at ${iconDirectory}/.`);
}

if (weatherJs.includes("assets/vendor/meteocons") || weatherJs.includes("/fill/")) {
  failures.push("weather.js still references the old vendor/fill Meteocons path.");
}

if (!html.includes("weather-timeline") || !html.includes("data-weather-play") || !html.includes("data-weather-range")) {
  failures.push("index.html does not include the weather timeline controls.");
}

if (!html.includes("timeline-time") || html.includes('class="sr-only" data-weather-output')) {
  failures.push("The weather timeline does not show a visible day/time output below the range.");
}

if (!weatherJs.includes("street-view-data/data/index.json")) {
  failures.push("weather.js does not load the street-view-data manifest.");
}

if (!weatherJs.includes("stopTimelinePlayback()")) {
  failures.push("weather.js does not stop timeline playback at the latest point.");
}

if (!weatherJs.includes("function handleManualSceneInput()") || !weatherJs.includes('form.addEventListener("input", handleManualSceneInput)')) {
  failures.push("Manual option changes do not pause timeline playback before applying the option value.");
}

if (!weatherJs.includes('stage.classList.add("is-weather-playback")') || !weatherJs.includes('stage.classList.remove("is-weather-playback")')) {
  failures.push("weather.js does not scope layer fades to active weather playback.");
}

if (!weatherJs.includes("formatTimelineTime")) {
  failures.push("weather.js does not format the visible timeline day/time.");
}

if (!weatherCss.includes(".about-trigger") || !weatherCss.includes("top: max(16px, env(safe-area-inset-top))") || !weatherCss.includes("left: max(16px, env(safe-area-inset-left))")) {
  failures.push("The about button is not positioned at the top left by default.");
}

if (!html.includes('popovertarget="original-photo"') || !html.includes('aria-label="View original image"')) {
  failures.push("index.html does not include an original image popover trigger.");
}

if (!html.includes('id="original-photo"') || !html.includes('src="original.webp"') || !html.includes('aria-label="original-photo"')) {
  failures.push("index.html does not include an original image popover with original.webp.");
}

if (!weatherCss.includes(".popover-actions") || !weatherCss.includes("grid-template-columns: repeat(2, 44px)")) {
  failures.push("The info and original image buttons are not grouped side by side.");
}

if (!weatherCss.includes(".original-photo") || !weatherCss.includes("place-items: center")) {
  failures.push("The original image popover does not center its image content.");
}

if (!weatherCss.includes("width: fit-content") || !weatherCss.includes("max-width: calc(100vw - 32px)")) {
  failures.push("The original image popover does not shrink-wrap to the contained image width.");
}

if (!weatherCss.includes("@media (min-width: 890px)") || !weatherCss.includes("bottom: max(28px, calc(env(safe-area-inset-bottom) + 28px))")) {
  failures.push("The about button does not move beside the timeline when there is enough horizontal space.");
}

if (!weatherCss.includes("@media (max-height: 720px)") || !weatherCss.includes("padding: 0 0 max(92px, calc(env(safe-area-inset-bottom) + 92px))")) {
  failures.push("Stage bottom padding is not limited to shallow screens.");
}

if (!weatherCss.includes(".stage.is-weather-playback img") || !weatherCss.includes(".stage.is-weather-playback img.is-hidden")) {
  failures.push("Layer opacity transitions are not scoped to active weather playback.");
}

const ignoredPaths = gitignore.split(/\r?\n/);

if (!ignoredPaths.includes(`${iconDirectory}/`) && !ignoredPaths.includes("assets/icons/")) {
  failures.push(`${iconDirectory}/ is not ignored in version control.`);
}

if (ignoredPaths.includes("data/")) {
  failures.push("data/ is now a submodule and must not be ignored in this repository.");
}

if (packageJson.scripts["fetch:weather"]) {
  failures.push("Weather fetching must live in the street-view-data repository, not this site repository.");
}

if (!packageJson.scripts.postinstall?.includes("sync:meteocons") || packageJson.scripts.postinstall?.includes("fetch:weather")) {
  failures.push("postinstall should only sync Meteocons in this repository.");
}

if (existsSync(weatherFetchScript) || existsSync("scripts/weather-mapping.mjs")) {
  failures.push("Weather fetch and transform scripts must live in the street-view-data repository.");
}

if (!gitmodules.includes("path = street-view-data") || !gitmodules.includes("street-view-data.git")) {
  failures.push("street-view-data is not configured as the weather data submodule.");
}

if (!deployWorkflow.includes("npm ci")) {
  failures.push("The deploy workflow does not install npm dependencies.");
}

if (!deployWorkflow.includes('cron: "0 0 * * *"')) {
  failures.push("The deploy workflow is not scheduled at midnight.");
}

if (!deployWorkflow.includes("submodules: true")) {
  failures.push("The deploy workflow does not check out the data submodule.");
}

if (!deployWorkflow.includes("git submodule update --remote street-view-data")) {
  failures.push("The deploy workflow does not update the data submodule to the latest remote data.");
}

if (deployWorkflow.includes("npm run fetch:weather")) {
  failures.push("The deploy workflow must not fetch or transform weather data in this repository.");
}

if (existsSync("street-view-data/data/index.json")) {
  const manifest = JSON.parse(readFileSync("street-view-data/data/index.json", "utf8"));

  if (!Array.isArray(manifest.points) || manifest.points.length !== 192) {
    failures.push("street-view-data/data/index.json does not contain exactly 192 weather points.");
  } else {
    const missingPointFiles = manifest.points.filter((point) => !existsSync(join("street-view-data/data", point.file)));
    const flatPointFiles = manifest.points.filter((point) => !/^\d{4}\/\d{2}\/\d{2}\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}\.json$/.test(point.file));

    if (missingPointFiles.length > 0) {
      failures.push(`street-view-data/data/index.json references missing point files: ${missingPointFiles.map((point) => point.file).join(", ")}.`);
    }

    if (flatPointFiles.length > 0) {
      failures.push(`street-view-data/data/index.json includes non-nested point files: ${flatPointFiles.map((point) => point.file).join(", ")}.`);
    }
  }
}

const missingIcons = icons.filter(
  (icon) => !existsSync(join(iconDirectory, `${icon}.svg`)),
);

if (missingIcons.length > 0) {
  failures.push(`Missing local Meteocons SVGs: ${missingIcons.join(", ")}.`);
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Passed.");
