import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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
