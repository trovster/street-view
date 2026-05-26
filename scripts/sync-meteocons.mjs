import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";

const html = readFileSync("index.html", "utf8");
const sourceDirectory = "node_modules/@meteocons/svg/fill";
const targetDirectory = "assets/icons/meteocons";
const icons = [
  ...new Set(
    [...html.matchAll(/data-meteocon="([^"]+)"/g)].map((match) => match[1]),
  ),
].sort();

const missingPackageIcons = icons.filter(
  (icon) => !existsSync(join(sourceDirectory, `${icon}.svg`)),
);

if (missingPackageIcons.length > 0) {
  console.error(
    `Missing @meteocons/svg fill icons: ${missingPackageIcons.join(", ")}.`,
  );
  process.exit(1);
}

rmSync(targetDirectory, { force: true, recursive: true });
mkdirSync(targetDirectory, { recursive: true });

for (const icon of icons) {
  copyFileSync(
    join(sourceDirectory, `${icon}.svg`),
    join(targetDirectory, `${icon}.svg`),
  );
}

console.log(`Synced ${icons.length} Meteocons SVGs to ${targetDirectory}.`);
