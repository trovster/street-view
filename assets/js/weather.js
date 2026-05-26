const form = document.querySelector("#weather-form");
const stage = document.querySelector(".stage");
const meteoconIconBaseUrl = "assets/icons/meteocons/";
const layers = new Map(
  Array.from(document.querySelectorAll("[data-layer]")).map((layer) => [layer.dataset.layer, layer])
);

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
    lighting: false,
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

function resetScene() {
  form.elements.baseLayer.value = "default";
  form.elements.scene.value = "day";
  form.elements.clouds.value = "few";
  form.elements.rain.value = "none";
  form.elements.snow.value = "none";
  form.elements.wind.value = "none";
  form.elements.fog.checked = false;
  updateScene();
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
  form.elements.baseLayer.value = "default";
  form.elements.scene.value = randomOptionValue(form.elements.scene);
  form.elements.clouds.value = randomOptionValue(form.elements.clouds);
  form.elements.rain.value = randomOptionValue(form.elements.rain);
  form.elements.snow.value = randomOptionValue(form.elements.snow);
  form.elements.wind.value = randomOptionValue(form.elements.wind);
  form.elements.fog.checked = Math.random() < 0.5;
  updateScene();
}

form.addEventListener("input", updateScene);
form.querySelector("[data-reset-scene]").addEventListener("click", resetScene);
form.querySelector("[data-random-scene]").addEventListener("click", randomScene);
loadMeteoconIcons();
updateScene();
