import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  deriveScene,
  moonIllumination,
  normaliseWeatherPoint,
  weatherConfig,
} from "./weather-mapping.mjs";

const html = readFileSync("index.html", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const weatherJs = readFileSync("assets/js/weather.js", "utf8");
const weatherCss = readFileSync("assets/css/weather.css", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const iconDirectory = "assets/icons/meteocons";
const weatherFetchScript = "scripts/fetch-weather-data.mjs";
const weatherFetchJs = existsSync(weatherFetchScript) ? readFileSync(weatherFetchScript, "utf8") : "";
const icons = [
  ...new Set(
    [...html.matchAll(/data-meteocon="([^"]+)"/g)].map((match) => match[1]),
  ),
].sort();

const failures = [];

function assertDeepEqual(actual, expected, message) {
  try {
    assert.deepEqual(actual, expected);
  } catch (error) {
    failures.push(`${message}: ${error.message}`);
  }
}

function assertEqual(actual, expected, message) {
  try {
    assert.equal(actual, expected);
  } catch (error) {
    failures.push(`${message}: ${error.message}`);
  }
}

function samplePoint(overrides = {}) {
  return {
    time: "2026-05-26T12:00",
    weather_code: 0,
    cloud_cover: 10,
    precipitation: 0,
    rain: 0,
    snowfall: 0,
    snow_depth: 0,
    wind_speed_10m: 4,
    wind_gusts_10m: 6,
    visibility: 20000,
    is_day: 1,
    ...overrides,
  };
}

function sampleAstronomy(overrides = {}) {
  return {
    sunrise: "2026-05-26T04:45",
    sunset: "2026-05-26T21:14",
    ...overrides,
  };
}

assertDeepEqual(
  deriveScene(samplePoint(), sampleAstronomy()),
  {
    baseLayer: "default",
    scene: "day",
    clouds: "none",
    rain: "none",
    snow: "none",
    wind: "none",
    fog: false,
  },
  "Clear day maps to a default day scene",
);

assertEqual(
  deriveScene(
    samplePoint({ time: "2026-05-26T03:50", is_day: 0 }),
    sampleAstronomy(),
  ).scene,
  "sunrise",
  "Times within the one-hour sunrise leeway map to sunrise",
);

assertEqual(
  deriveScene(
    samplePoint({ time: "2026-05-26T22:10", is_day: 0 }),
    sampleAstronomy(),
  ).scene,
  "sunset",
  "Times within the one-hour sunset leeway map to sunset",
);

assertDeepEqual(
  deriveScene(
    samplePoint({
      weather_code: 61,
      cloud_cover: 82,
      precipitation: 0.7,
      rain: 0.7,
      wind_speed_10m: 18,
    }),
    sampleAstronomy(),
  ),
  {
    baseLayer: "default",
    scene: "day",
    clouds: "many",
    rain: "light",
    snow: "none",
    wind: "light",
    fog: false,
  },
  "Rain, clouds, and wind map to visible weather layers",
);

assertDeepEqual(
  deriveScene(
    samplePoint({
      weather_code: 75,
      snowfall: 1.2,
      snow_depth: 0.021,
    }),
    sampleAstronomy(),
  ),
  {
    baseLayer: "snow",
    scene: "day",
    clouds: "none",
    rain: "none",
    snow: "heavy",
    wind: "none",
    fog: false,
  },
  "Heavy active snow and settled snow map to snow overlay and base layer",
);

assertEqual(
  deriveScene(samplePoint({ weather_code: 45, visibility: 800 }), sampleAstronomy()).fog,
  true,
  "Fog weather codes or low visibility enable fog",
);

assertEqual(
  deriveScene(
    samplePoint({ wind_speed_10m: 28, wind_gusts_10m: 48 }),
    sampleAstronomy(),
  ).wind,
  "strong",
  "Strong gusts enable strong wind",
);

assertEqual(
  deriveScene(
    samplePoint({ time: "2000-01-21T18:00:00Z", is_day: 0 }),
    sampleAstronomy({
      sunrise: "2000-01-21T08:00:00Z",
      sunset: "2000-01-21T16:00:00Z",
    }),
  ).scene,
  "night-full",
  "Night points with moon illumination at least half use the full moon layer",
);

assertEqual(
  deriveScene(
    samplePoint({ time: "2000-01-06T18:00:00Z", is_day: 0 }),
    sampleAstronomy({
      sunrise: "2000-01-06T08:00:00Z",
      sunset: "2000-01-06T16:00:00Z",
    }),
  ).scene,
  "night-half",
  "Night points with moon illumination below half use the crescent moon layer",
);

const normalisedPoint = normaliseWeatherPoint(samplePoint(), sampleAstronomy());

assertEqual(normalisedPoint.source, "open-meteo", "Normalised points include the data source");
assertEqual(normalisedPoint.raw.weather_code, 0, "Normalised points preserve raw weather values");
assertEqual(
  weatherConfig.sunriseSunsetLeewayMinutes,
  60,
  "Sunrise and sunset leeway is one hour either side",
);
assertEqual(
  typeof moonIllumination(new Date("2000-01-21T18:00:00Z")),
  "number",
  "Moon illumination returns a numeric value",
);

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

if (!weatherJs.includes("data/index.json")) {
  failures.push("weather.js does not load data/index.json.");
}

if (!weatherJs.includes("stopTimelinePlayback()")) {
  failures.push("weather.js does not stop timeline playback at the latest point.");
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

if (!weatherCss.includes("@media (min-width: 800px)") || !weatherCss.includes("bottom: max(28px, calc(env(safe-area-inset-bottom) + 28px))")) {
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

if (!ignoredPaths.includes("data/")) {
  failures.push("data/ is not ignored in version control.");
}

if (!packageJson.scripts["fetch:weather"]) {
  failures.push("package.json does not define fetch:weather.");
}

if (!packageJson.scripts.postinstall?.includes("sync:meteocons") || !packageJson.scripts.postinstall?.includes("fetch:weather")) {
  failures.push("postinstall does not sync Meteocons and fetch weather data.");
}

if (!existsSync(weatherFetchScript)) {
  failures.push(`${weatherFetchScript} does not exist.`);
}

if (weatherFetchJs && (!weatherFetchJs.includes("node:https") || weatherFetchJs.includes("await fetch("))) {
  failures.push(`${weatherFetchScript} must use node:https instead of global fetch for Node 16 compatibility.`);
}

if (!deployWorkflow.includes("npm ci")) {
  failures.push("The deploy workflow does not install npm dependencies.");
}

if (!deployWorkflow.includes('cron: "0 0 * * *"')) {
  failures.push("The deploy workflow is not scheduled once a day at midnight.");
}

const fetchWeatherIndex = deployWorkflow.indexOf("npm run fetch:weather -- --strict");
const testIndex = deployWorkflow.indexOf("npm test");

if (fetchWeatherIndex === -1) {
  failures.push("The deploy workflow does not run a strict weather fetch.");
} else if (testIndex === -1 || fetchWeatherIndex > testIndex) {
  failures.push("The deploy workflow does not fetch weather data before tests.");
}

if (existsSync("data/index.json")) {
  const manifest = JSON.parse(readFileSync("data/index.json", "utf8"));

  if (!Array.isArray(manifest.points) || manifest.points.length !== 192) {
    failures.push("data/index.json does not contain exactly 192 weather points.");
  } else {
    const missingPointFiles = manifest.points.filter((point) => !existsSync(join("data", point.file)));

    if (missingPointFiles.length > 0) {
      failures.push(`data/index.json references missing point files: ${missingPointFiles.map((point) => point.file).join(", ")}.`);
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
