import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const html = readFileSync("index.html", "utf8");
const weatherJs = readFileSync("assets/js/weather.js", "utf8");
const weatherCss = readFileSync("assets/css/weather.css", "utf8");
const gitignore = readFileSync(".gitignore", "utf8");
const deployWorkflow = readFileSync(".github/workflows/deploy.yml", "utf8");
const iconDirectory = "assets/icons/meteocons";
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

if (!gitignore.split(/\r?\n/).includes(`${iconDirectory}/`)) {
  failures.push(`${iconDirectory}/ is not ignored in version control.`);
}

if (!deployWorkflow.includes("npm ci")) {
  failures.push("The deploy workflow does not install npm dependencies.");
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
