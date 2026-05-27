const form = document.querySelector("#weather-form");
const stage = document.querySelector(".stage");
const timeline = document.querySelector(".weather-timeline");
const timelinePlayButton = document.querySelector("[data-weather-play]");
const timelinePlayIcon = document.querySelector("[data-weather-play-icon]");
const timelineRange = document.querySelector("[data-weather-range]");
const timelineOutput = document.querySelector("[data-weather-output]");
const popovers = Array.from(document.querySelectorAll("[popover]"));
const meteoconIconBaseUrl = "assets/icons/meteocons/";
const weatherDataIndexUrl = "street-view-data/data/index.json";
const timelinePlaybackDelay = 200;
const playIconPath = "M8 5v14l11-7z";
const pauseIconPath = "M8 5h3v14H8zM13 5h3v14h-3z";
const layers = new Map(
  Array.from(document.querySelectorAll("[data-layer]")).map((layer) => [layer.dataset.layer, layer])
);
const timelineState = {
  currentIndex: 0,
  interval: null,
  manifest: null,
  openPopovers: new Set(),
  points: [],
  pointCache: new Map(),
  resumeAfterPopoverCloses: false,
};

const scenes = {
  day: {
    sky: "sky-day",
    object: "sun-full",
    stars: "none",
    lighting: false,
  },
  sunrise: {
    sky: "sky-sunrise",
    object: "sun-top-half",
    stars: "none",
    lighting: false,
  },
  sunset: {
    sky: "sky-sunset",
    object: "none",
    stars: "few",
    lighting: true,
  },
  "night-full": {
    sky: "sky-night",
    object: "moon-full",
    stars: "few",
    lighting: true,
  },
  "night-half": {
    sky: "sky-night",
    object: "moon-crescent",
    stars: "many",
    lighting: true,
  },
};

function setLayer(name, isVisible) {
  layers.get(name)?.classList.toggle("is-hidden", !isVisible);
}

function showOnly(group, active) {
  group.forEach((name) => setLayer(name, name === active));
}

function loadMeteoconIcons() {
  document.querySelectorAll("[data-meteocon]").forEach((icon) => {
    icon.src = `${meteoconIconBaseUrl}${icon.dataset.meteocon}.svg`;
  });
}

function updateScene() {
  const data = new FormData(form);
  const baseLayer = data.get("baseLayer");
  const scene = data.get("scene");
  const clouds = data.get("clouds");
  const rain = data.get("rain");
  const snow = data.get("snow");
  const wind = data.get("wind");
  const sceneConfig = scenes[scene];

  const windClouds = clouds === "many" ? "many" : "few";
  const activeWindLayer = wind === "none" ? "" : `wind-${wind}-clouds-${windClouds}`;

  showOnly(["sky-day", "sky-sunrise", "sky-sunset", "sky-night"], sceneConfig.sky);

  showOnly(["sun-full", "sun-top-half", "moon-full", "moon-crescent"], sceneConfig.object);
  showOnly(["stars-few", "stars-many"], sceneConfig.stars === "none" ? "" : `stars-${sceneConfig.stars}`);

  setLayer("clouds-few", clouds === "few");
  setLayer("clouds-many", clouds === "many");
  setLayer("rain-light", rain === "light");
  setLayer("rain-heavy", rain === "heavy");
  setLayer("snow-light", snow === "light");
  setLayer("snow-heavy", snow === "heavy");
  showOnly([
    "wind-light-clouds-few",
    "wind-light-clouds-many",
    "wind-strong-clouds-few",
    "wind-strong-clouds-many",
  ], activeWindLayer);
  setLayer("fog", data.has("fog"));
  setLayer("turbine", true);
  setLayer("turbine-blades", true);
  setLayer("lighting", sceneConfig.lighting);
  setLayer("wet-road", rain === "heavy");
  setLayer("base", baseLayer === "default");
  setLayer("base-snow", baseLayer === "snow");

  stage.classList.toggle("wind-light", wind === "light");
  stage.classList.toggle("wind-strong", wind === "strong");
}

function applyScene(scene) {
  form.elements.baseLayer.value = scene.baseLayer;
  form.elements.scene.value = scene.scene;
  form.elements.clouds.value = scene.clouds;
  form.elements.rain.value = scene.rain;
  form.elements.snow.value = scene.snow;
  form.elements.wind.value = scene.wind;
  form.elements.fog.checked = Boolean(scene.fog);
  updateScene();
}

function defaultSceneForDate(date = new Date()) {
  const hour = date.getHours();

  return {
    baseLayer: "default",
    scene: hour >= 7 && hour < 21 ? "day" : "night-full",
    clouds: "few",
    rain: "none",
    snow: "none",
    wind: "none",
    fog: false,
  };
}

function resetScene() {
  applyScene(defaultSceneForDate());
}

function optionValues(control) {
  if (control.options) {
    return Array.from(control.options).map((option) => option.value);
  }

  return Array.from(control).map((option) => option.value);
}

function randomOptionValue(control) {
  const values = optionValues(control);
  return values[Math.floor(Math.random() * values.length)];
}

function randomScene() {
  applyScene({
    baseLayer: "default",
    scene: randomOptionValue(form.elements.scene),
    clouds: randomOptionValue(form.elements.clouds),
    rain: randomOptionValue(form.elements.rain),
    snow: randomOptionValue(form.elements.snow),
    wind: randomOptionValue(form.elements.wind),
    fog: Math.random() < 0.25,
  });
}

async function loadWeatherTimeline() {
  if (!timeline || !timelinePlayButton || !timelineRange) {
    return;
  }

  try {
    const response = await fetch(weatherDataIndexUrl);

    if (!response.ok) {
      throw new Error("Weather manifest unavailable.");
    }

    const manifest = await response.json();
    const points = Array.isArray(manifest.points) ? manifest.points : [];

    if (points.length === 0) {
      throw new Error("Weather manifest has no points.");
    }

    timelineState.manifest = manifest;
    timelineState.points = points;
    timelineState.currentIndex = 0;
    timelineRange.max = String(points.length - 1);
    timelineRange.value = String(timelineState.currentIndex);
    timeline.hidden = false;

    if (timelineOutput) {
      const formattedTime = formatTimelineTime(points[timelineState.currentIndex].time);

      timelineOutput.value = formattedTime;
      timelineOutput.textContent = formattedTime;
    }
  } catch {
    timeline.hidden = true;
  }
}

async function selectTimelinePoint(index) {
  const nextIndex = clamp(index, 0, timelineState.points.length - 1);
  const pointReference = timelineState.points[nextIndex];

  if (!pointReference) {
    return;
  }

  timelineState.currentIndex = nextIndex;
  timelineRange.value = String(nextIndex);

  if (timelineOutput) {
    const formattedTime = formatTimelineTime(pointReference.time);

    timelineOutput.value = formattedTime;
    timelineOutput.textContent = formattedTime;
  }

  const point = await fetchTimelinePoint(pointReference);
  applyScene(point.scene);
}

async function fetchTimelinePoint(pointReference) {
  if (timelineState.pointCache.has(pointReference.file)) {
    return timelineState.pointCache.get(pointReference.file);
  }

  const response = await fetch(new URL(pointReference.file, new URL(weatherDataIndexUrl, window.location.href)));

  if (!response.ok) {
    throw new Error(`Weather point unavailable: ${pointReference.file}`);
  }

  const point = await response.json();
  timelineState.pointCache.set(pointReference.file, point);

  return point;
}

async function startTimelinePlayback() {
  if (timelineState.interval || timelineState.points.length === 0) {
    return;
  }

  stage.classList.add("is-weather-playback");

  if (timelineState.currentIndex >= timelineState.points.length - 1) {
    try {
      await selectTimelinePoint(0);
    } catch {
      stopTimelinePlayback();
      return;
    }
  }

  timelineState.interval = window.setInterval(advanceTimelinePlayback, timelinePlaybackDelay);
  timelinePlayButton.setAttribute("aria-label", "Pause weather timeline");
  timelinePlayIcon?.setAttribute("d", pauseIconPath);
}

function stopTimelinePlayback() {
  if (timelineState.interval) {
    window.clearInterval(timelineState.interval);
    timelineState.interval = null;
  }

  timelinePlayButton?.setAttribute("aria-label", "Play weather timeline");
  timelinePlayIcon?.setAttribute("d", playIconPath);
  stage.classList.remove("is-weather-playback");
}

async function advanceTimelinePlayback() {
  if (timelineState.currentIndex >= timelineState.points.length - 1) {
    stopTimelinePlayback();
    return;
  }

  try {
    await selectTimelinePoint(timelineState.currentIndex + 1);
  } catch {
    stopTimelinePlayback();
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value), min), max);
}

function formatTimelineTime(time) {
  const match = time.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);

  if (!match) {
    return time;
  }

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute));

  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(date);
}

function handleManualSceneInput() {
  stopTimelinePlayback();
  updateScene();
}

function handlePopoverToggle(event) {
  const popover = event.currentTarget;

  if (event.newState === "open") {
    timelineState.openPopovers.add(popover);

    if (timelineState.interval) {
      timelineState.resumeAfterPopoverCloses = true;
      stopTimelinePlayback();
    }

    return;
  }

  if (event.newState === "closed") {
    timelineState.openPopovers.delete(popover);

    if (timelineState.openPopovers.size === 0 && timelineState.resumeAfterPopoverCloses) {
      timelineState.resumeAfterPopoverCloses = false;
      startTimelinePlayback();
    }
  }
}

form.addEventListener("input", handleManualSceneInput);
form.querySelector("[data-reset-scene]").addEventListener("click", resetScene);
form.querySelector("[data-random-scene]").addEventListener("click", randomScene);
popovers.forEach((popover) => popover.addEventListener("toggle", handlePopoverToggle));
timelinePlayButton?.addEventListener("click", () => {
  if (timelineState.interval) {
    stopTimelinePlayback();
    return;
  }

  startTimelinePlayback();
});
timelineRange?.addEventListener("input", () => {
  stopTimelinePlayback();
  selectTimelinePoint(timelineRange.value).catch(() => {
    timeline.hidden = true;
  });
});
loadMeteoconIcons();
resetScene();
loadWeatherTimeline();
