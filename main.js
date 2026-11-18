import {
  THREE as T,
  v3,
  mod,
  clamp,
  groundLevel,
  canWalk,
} from "./geometry.js";
import { cityRenderer } from "./render.js";
import { district } from "./district.js";
import { population } from "./actors.js";
const canvas = document.querySelector("#city"),
  flightButton = document.querySelector("#flight"),
  recordButton = document.querySelector("#record"),
  fullButton = document.querySelector("#full"),
  notice = document.querySelector("#notice"),
  loading = document.querySelector("#loading");
const scene = new T.Scene(),
  camera = new T.PerspectiveCamera(56, 1, 0.055, 680);
const filmSeconds = 46,
  eye = 1.67,
  keys = new Set(),
  walk = v3(0.1, 0, 40.1),
  lastWalk = v3(0, 0, 0),
  target = v3(0, 0, 0);
let viewYaw = -0.014,
  viewPitch = 0.121,
  flight = false,
  filmTime = 0,
  worldTime = 0,
  ready = false,
  waitingForLock = false,
  boundedLook = false,
  lookPointer = null,
  stickPointer = null,
  stickX = 0,
  stickY = 0,
  dragX = 0,
  dragY = 0,
  padX = 0,
  padY = 0;
let renderer,
  actors,
  districtLights,
  recorder = null,
  noticeTimer,
  quietTimer,
  previous = 0,
  frameCost = 0,
  frameSamples = 0,
  walkTime = 0;
const path = new T.CatmullRomCurve3(
  [
    [0.1, 4.02, 40.1],
    [-0.9, 3.3, 31.5],
    [-3.4, 2.18, 17],
    [-5.9, 2.45, -1],
    [-8.9, 4.5, -18],
    [-9.8, 10.7, -38],
    [-5, 21.7, -58],
    [6.3, 32, -67],
    [9.2, 36, -46],
    [7.3, 29, -6],
    [2.6, 18, 24],
    [0.1, 4.02, 40.1],
  ].map((p) => v3(...p)),
  false,
  "centripetal",
);
const looks = new T.CatmullRomCurve3(
  [
    [1.2, 18, -88],
    [0.5, 10, -79],
    [-1, 5.5, -63],
    [-10, 6.7, -48],
    [-14, 10, -61],
    [-1, 23, -92],
    [1, 39, -106],
    [1, 45, -106],
    [30, 20, -19],
    [6, 4, 39],
    [-23, 10, 37],
    [1.2, 18, -88],
  ].map((p) => v3(...p)),
  false,
  "centripetal",
);
function say(s, ms = 4200) {
  clearTimeout(noticeTimer);
  notice.textContent = s;
  if (ms) noticeTimer = setTimeout(() => (notice.textContent = ""), ms);
}
function wake() {
  document.body.classList.remove("quiet");
  clearTimeout(quietTimer);
  quietTimer = setTimeout(() => document.body.classList.add("quiet"), 2400);
}
function progress(n) {
  loading.style.setProperty("--progress", String(n));
}
function filmCamera() {
  const u = clamp(filmTime / filmSeconds, 0, 1);
  path.getPoint(u, camera.position);
  looks.getPoint(u, target);
  camera.lookAt(target);
  camera.fov = 56 + 3 * Math.sin(Math.PI * u);
  camera.updateProjectionMatrix();
}
function walkCamera(dt, motion = true) {
  const x = Number(keys.has("KeyD")) - Number(keys.has("KeyA")) + stickX,
    forward =
      Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown")) -
      stickY;
  viewYaw +=
    (Number(keys.has("ArrowLeft")) - Number(keys.has("ArrowRight"))) * dt * 1.3;
  const mag = Math.hypot(x, forward),
    s =
      ((keys.has("ShiftLeft") || keys.has("ShiftRight") ? 4.8 : 2.3) * dt) /
      Math.max(1, mag);
  if (mag && motion) {
    const dx = (x * Math.cos(viewYaw) - forward * Math.sin(viewYaw)) * s,
      dz = (-forward * Math.cos(viewYaw) - x * Math.sin(viewYaw)) * s;
    const free = (xx, zz) =>
      canWalk(xx, zz) &&
      groundLevel(xx, zz) - groundLevel(walk.x, walk.z) < 0.36 &&
      !actors?.cars.some(
        (a) =>
          Math.abs(xx - a.px) < (a.cross ? 2.5 : 1.14) &&
          Math.abs(zz - a.pz) < (a.cross ? 1.14 : 2.5),
      ) &&
      !actors?.people.some(
        (a) =>
          Math.hypot(xx - a.px, zz - a.pz) < 0.3 &&
          Math.hypot(xx - a.px, zz - a.pz) <
            Math.hypot(walk.x - a.px, walk.z - a.pz),
      );
    if (free(walk.x + dx, walk.z)) walk.x += dx;
    if (free(walk.x, walk.z + dz)) walk.z += dz;
    walkTime += dt * Math.min(mag, 1);
  }
  const floor = groundLevel(walk.x, walk.z) + eye;
  walk.y = walk.y ? T.MathUtils.damp(walk.y, floor, 17, dt) : floor;
  camera.position.copy(walk);
  camera.position.y +=
    motion && mag && !matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0.012 * Math.sin(walkTime * 9)
      : 0;
  camera.rotation.order = "YXZ";
  camera.rotation.set(viewPitch, viewYaw, 0, "YXZ");
  camera.fov = 56;
  camera.updateProjectionMatrix();
}
function setFlight(on) {
  if (!ready || on === flight) return;
  if (!on && recorder?.state === "recording") recorder.stop();
  if (on) {
    lastWalk.copy(walk);
    endMouseLook();
    filmTime = 0;
    keys.clear();
    releaseTouches();
  } else {
    walk.copy(lastWalk);
  }
  flight = on;
  flightButton.setAttribute("aria-pressed", String(on));
  flightButton.setAttribute(
    "aria-label",
    on ? "Вернуться к прогулке" : "Включить пролёт",
  );
  if (on) filmCamera();
  else walkCamera(1, false);
  wake();
}
function releaseTouches() {
  lookPointer = null;
  stickPointer = null;
  stickX = stickY = 0;
  document.querySelector("#pad").style.display = "none";
}
function turn(dx, dy, factor) {
  viewYaw -= dx * factor;
  viewPitch = clamp(viewPitch - dy * factor, -1.24, 1.31);
}
function endMouseLook() {
  waitingForLock = false;
  boundedLook = false;
  canvas.classList.remove("mouse-look");
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function useBoundedLook() {
  // An embedded preview may allow mouse events but deny pointer lock.
  if (waitingForLock && ready && !flight && document.hasFocus()) {
    boundedLook = true;
    canvas.classList.add("mouse-look");
  }
  waitingForLock = false;
}
async function startMouseLook() {
  if (waitingForLock || document.pointerLockElement === canvas) return;
  waitingForLock = true;
  if (!canvas.requestPointerLock) return useBoundedLook();
  try {
    await canvas.requestPointerLock();
  } catch {
    useBoundedLook();
  }
}
document.addEventListener("pointerlockerror", useBoundedLook);
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    if (!waitingForLock || flight || !ready) return endMouseLook();
    waitingForLock = false;
    boundedLook = false;
  }
  canvas.classList.toggle("mouse-look", locked || boundedLook);
});
canvas.addEventListener("pointerdown", (ev) => {
  if (!ready) return;
  canvas.focus({ preventScroll: true });
  wake();
  if (flight) return;
  if (ev.pointerType === "mouse") {
    if (ev.button === 0) startMouseLook();
    return;
  }
  if (
    ev.pointerType === "touch" &&
    ev.clientX < innerWidth * 0.46 &&
    stickPointer === null
  ) {
    stickPointer = ev.pointerId;
    padX = ev.clientX;
    padY = ev.clientY;
    const pad = document.querySelector("#pad");
    pad.style.left = padX + "px";
    pad.style.top = padY + "px";
    pad.style.display = "block";
    pad.firstElementChild.style.transform = "";
  } else if (lookPointer === null) {
    lookPointer = ev.pointerId;
    dragX = ev.clientX;
    dragY = ev.clientY;
  }
  canvas.setPointerCapture(ev.pointerId);
});
canvas.addEventListener("pointermove", (ev) => {
  if (flight) return;
  if (stickPointer === ev.pointerId) {
    const x = ev.clientX - padX,
      y = ev.clientY - padY,
      r = Math.max(34, Math.hypot(x, y));
    stickX = x / r;
    stickY = y / r;
    document.querySelector("#pad b").style.transform =
      "translate(" + stickX * 24 + "px," + stickY * 24 + "px)";
  } else if (lookPointer === ev.pointerId && !document.pointerLockElement) {
    turn(
      ev.clientX - dragX,
      ev.clientY - dragY,
      ev.pointerType === "touch" ? 0.004 : 0.003,
    );
    dragX = ev.clientX;
    dragY = ev.clientY;
  }
});
function lift(ev) {
  if (stickPointer === ev.pointerId) {
    stickPointer = null;
    stickX = stickY = 0;
    document.querySelector("#pad").style.display = "none";
  }
  if (lookPointer === ev.pointerId) lookPointer = null;
}
for (const e of ["pointerup", "pointercancel", "lostpointercapture"])
  canvas.addEventListener(e, lift);
document.addEventListener("mousemove", (ev) => {
  if (ev.target === canvas && canvas.classList.contains("mouse-look") && !flight) {
    turn(ev.movementX, ev.movementY, 0.0022);
  } else if (!ev.buttons) wake();
});
function recordingAvailable() {
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof canvas.captureStream === "function"
  );
}
function record() {
  if (!ready) return;
  if (recorder?.state === "recording") {
    recorder.stop();
    return;
  }
  if (recorder) return;
  if (!recordingAvailable()) {
    say("Этот браузер не поддерживает запись холста.");
    return;
  }
  let stream;
  try {
    const mime = [
      "video/mp4;codecs=avc1.42002a",
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ].find((t) => MediaRecorder.isTypeSupported(t));
    stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, {
      ...(mime ? { mimeType: mime } : {}),
      videoBitsPerSecond: 10_000_000,
    });
    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      recordButton.setAttribute("aria-pressed", "false");
      recordButton.setAttribute("aria-label", "Записать пролёт");
      recordButton.title = "Записать пролёт (R)";
      recorder = null;
      renderer.resize();
      if (chunks.length) {
        const type = rec.mimeType || chunks[0].type,
          blob = new Blob(chunks, { type }),
          a = document.createElement("a"),
          url = URL.createObjectURL(blob);
        a.href = url;
        a.download =
          "Times-Square-" +
          new Date().toISOString().replace(/[:.]/g, "-") +
          (type.includes("mp4") ? ".mp4" : ".webm");
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else say("Браузер не вернул кадры записи.");
    };
    rec.onerror = () => {
      say("Не удалось завершить запись в этом браузере.");
      if (rec.state === "recording") rec.stop();
    };
    setFlight(true);
    filmTime = 0;
    filmCamera();
    actors.update(worldTime, camera, renderer.low);
    renderer.render(worldTime);
    rec.start(500);
    recorder = rec;
    recordButton.setAttribute("aria-pressed", "true");
    recordButton.title = "Остановить и сохранить (R)";
    recordButton.setAttribute("aria-label", "Остановить и сохранить запись");
    wake();
  } catch {
    stream?.getTracks().forEach((t) => t.stop());
    say("Браузер не смог начать запись.");
  }
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    say("Полный экран недоступен в этом окне.");
  }
}
window.addEventListener("keydown", (e) => {
  if (!ready || e.ctrlKey || e.metaKey || e.altKey) return;
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (!e.repeat) {
    if (e.code === "KeyF") setFlight(!flight);
    if (e.code === "KeyR") record();
    if (e.code === "Enter" && e.target.tagName !== "BUTTON") fullscreen();
    if (e.code === "Escape") {
      endMouseLook();
      if (flight) setFlight(false);
    }
    if (
      flight &&
      !recorder &&
      ["KeyW", "KeyA", "KeyS", "KeyD"].includes(e.code)
    )
      setFlight(false);
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  releaseTouches();
  endMouseLook();
});
document.addEventListener("visibilitychange", () => {
  previous = 0;
  if (document.hidden && recorder?.state === "recording") recorder.stop();
});
flightButton.onclick = () => setFlight(!flight);
recordButton.onclick = record;
fullButton.onclick = fullscreen;
if (!document.fullscreenEnabled) fullButton.hidden = true;
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  ready = false;
  endMouseLook();
  if (recorder?.state === "recording") recorder.stop();
  say("Графический контекст потерян. Перезагрузите страницу.", 0);
});
window.addEventListener("resize", () => {
  if (!recorder) renderer?.resize();
});
function animate(now) {
  requestAnimationFrame(animate);
  if (!ready || document.hidden) return;
  const raw = previous ? (now - previous) / 1000 : 0;
  previous = now;
  const dt = Math.min(0.08, raw);
  worldTime += dt;
  if (flight) {
    filmTime += recorder?.state === "recording" ? raw : dt;
    if (filmTime >= filmSeconds) {
      if (recorder?.state === "recording") {
        filmTime = filmSeconds;
        filmCamera();
        actors.update(worldTime, camera, renderer.low);
        renderer.render(worldTime);
        recorder.stop();
        return;
      }
      filmTime = mod(filmTime, filmSeconds);
    }
    filmCamera();
  } else walkCamera(dt);
  districtLights(worldTime);
  actors.update(worldTime, camera, renderer.low);
  renderer.render(worldTime);
  if (raw > 0 && raw < 0.5 && !recorder) {
    frameCost += raw;
    frameSamples++;
    if (frameSamples >= 70) {
      if (frameCost / frameSamples > 0.041) renderer.lower();
      frameSamples = 0;
      frameCost = 0;
    }
  }
}
try {
  progress(0.08);
  renderer = await cityRenderer(canvas, scene, camera);
  progress(0.26);
  const city = await district(scene);
  districtLights = city.update;
  renderer.streetGlows(city.lights);
  progress(0.55);
  actors = await population(scene, city.monument);
  progress(0.87);
  walkCamera(1, false);
  actors.update(0, camera, renderer.low);
  renderer.render(0);
  ready = true;
  recordButton.disabled = !recordingAvailable();
  if (recordButton.disabled)
    recordButton.title = "Браузер не поддерживает запись";
  progress(1);
  loading.classList.add("done");
  setTimeout(() => (loading.hidden = true), 650);
  wake();
  requestAnimationFrame(animate);
} catch (error) {
  console.error(error);
  loading.classList.add("done");
  say(
    "Не удалось открыть 3D-сцену. Проверьте поддержку WebGL 2 и перезагрузите страницу.",
    0,
  );
}
