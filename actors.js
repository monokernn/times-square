import {
  THREE as T,
  binary,
  texture,
  range,
  random,
  pick,
  mod,
  stair,
  groundLevel,
  crossStreets,
  v3,
  canWalk,
} from "./geometry.js";
import { rightEdge } from "./district.js";
const attr = (a, n) => new T.BufferAttribute(a, n);
const tintPalette = [
  0x25313e, 0x575354, 0x812d30, 0x324958, 0x58644f, 0xb6a69a, 0x232326,
  0x89614d, 0xc1beb7, 0x404357, 0x29456a, 0x6a493a, 0x86577a, 0x9b6945,
  0x475a60, 0x293540,
];
const temp = new T.Object3D();
function transform(x, y, z, angle, width, height = width, depth = width) {
  temp.position.set(x, y, z);
  temp.rotation.set(0, angle, 0);
  temp.scale.set(width, height, depth);
  temp.updateMatrix();
  return temp.matrix;
}
const skinGLSL = `
 attribute vec4 jointIds; attribute vec4 weights; attribute float cloth; attribute vec3 outfit; attribute vec2 cycle;
 uniform sampler2D poseTexture; uniform float jointCount; uniform float poseFrames; uniform float seconds; uniform float loopDuration;
 varying float vCloth; varying vec3 vOutfit;
 mat4 bone(float id,float t){
  float inv=1./(jointCount*4.);float x=(id*4.+.5)*inv;
  return mat4(texture2D(poseTexture,vec2(x,t)),texture2D(poseTexture,vec2(x+inv,t)),texture2D(poseTexture,vec2(x+2.*inv,t)),texture2D(poseTexture,vec2(x+3.*inv,t)));
 }
`;
async function actorType(scene, k, capacity, clock) {
  const [a, atlas] = await Promise.all([
    binary("person" + k),
    texture("person" + k),
  ]);
  atlas.flipY = false;
  atlas.needsUpdate = true;
  const boneTex = new T.DataTexture(
    a.bones,
    a.meta.joints * 4,
    a.meta.frames,
    T.RGBAFormat,
    T.FloatType,
  );
  boneTex.minFilter = boneTex.magFilter = T.LinearFilter;
  boneTex.wrapT = T.RepeatWrapping;
  boneTex.needsUpdate = true;
  const mat = new T.MeshStandardMaterial({
    map: atlas,
    roughness: 0.86,
    alphaTest: 0.37,
    side: T.DoubleSide,
    envMapIntensity: 0.16,
  });
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      poseTexture: { value: boneTex },
      jointCount: { value: a.meta.joints },
      poseFrames: { value: a.meta.frames },
      loopDuration: { value: a.meta.duration },
      seconds: clock,
    });
    s.vertexShader = skinGLSL + s.vertexShader;
    s.vertexShader = s.vertexShader
      .replace(
        "#include <beginnormal_vertex>",
        `
   float frame=fract(seconds*cycle.y/loopDuration+cycle.x)+.5/poseFrames;
   mat4 deform=bone(jointIds.x,frame)*weights.x+bone(jointIds.y,frame)*weights.y+bone(jointIds.z,frame)*weights.z+bone(jointIds.w,frame)*weights.w;
   vec3 objectNormal=mat3(deform)*normal;
  `,
      )
      .replace(
        "#include <begin_vertex>",
        "vec3 transformed=(deform*vec4(position,1.)).xyz; vOutfit=outfit;vCloth=cloth;",
      );
    s.fragmentShader =
      "varying float vCloth;varying vec3 vOutfit;\n" + s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <map_fragment>",
      "#include <map_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vOutfit*(.75+dot(diffuseColor.rgb,vec3(.6))),vCloth);",
    );
  };
  const lods = [];
  for (let lod = 0; lod < 3; lod++) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", attr(a["p" + lod], 3));
    g.setAttribute("normal", attr(a["n" + lod], 3));
    g.setAttribute("uv", attr(a["uv" + lod], 2));
    g.setAttribute("jointIds", attr(a["j" + lod], 4));
    g.setAttribute("weights", attr(a["w" + lod], 4));
    g.setAttribute("cloth", attr(a["shirt" + lod], 1));
    g.setIndex(attr(a["i" + lod], 1));
    for (const [key, n] of [
      ["cycle", 2],
      ["outfit", 3],
    ])
      g.setAttribute(
        key,
        new T.InstancedBufferAttribute(
          new Float32Array(capacity * n),
          n,
        ).setUsage(T.DynamicDrawUsage),
      );
    const m = new T.InstancedMesh(g, mat, capacity);
    m.count = 0;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(T.DynamicDrawUsage);
    scene.add(m);
    lods.push(m);
  }
  return lods;
}
function makeTaxiDecal() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 100;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#111216";
  ctx.beginPath();
  ctx.arc(54, 50, 38, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f8aa21";
  ctx.font = "bold 65px Arial";
  ctx.fillText("T", 34, 73);
  ctx.fillStyle = "#14161a";
  ctx.font = "bold 31px Arial";
  ctx.fillText("NYC", 102, 47);
  ctx.font = "bold 20px Arial";
  ctx.fillText("TAXI", 103, 70);
  const tx = new T.CanvasTexture(c);
  tx.colorSpace = T.SRGBColorSpace;
  return tx;
}
async function carType(scene, name, capacity, decal) {
  const a = await binary(name),
    g = new T.BufferGeometry();
  g.setAttribute("position", attr(a.p, 3));
  g.setAttribute("normal", attr(a.n, 3));
  g.setAttribute("part", attr(a.part, 1));
  g.setIndex(attr(a.i, 1));
  g.setAttribute(
    "paint",
    new T.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
  );
  const mat = new T.MeshStandardMaterial({
    metalness: 0.48,
    roughness: 0.25,
    envMapIntensity: 0.95,
  });
  mat.onBeforeCompile = (s) => {
    s.uniforms.taxiMark = { value: decal };
    s.vertexShader =
      "attribute float part;attribute vec3 paint;varying float vPart;varying vec3 vPaint;varying vec3 localCar;\n" +
      s.vertexShader;
    s.vertexShader = s.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvPart=part;vPaint=paint;localCar=position;",
    );
    s.fragmentShader =
      "varying float vPart;varying vec3 vPaint;varying vec3 localCar;uniform sampler2D taxiMark;\n" +
      s.fragmentShader;
    s.fragmentShader = s.fragmentShader.replace(
      "#include <color_fragment>",
      `
   diffuseColor.rgb=vec3(.015,.019,.025);
   if(vPart>.5&&vPart<1.5){diffuseColor.rgb=vPaint;
    ` +
        (name === "taxi"
          ? `if(abs(localCar.x)>.80){vec2 uv=vec2(.50-localCar.z/.98,(localCar.y-.60)/.39);if(all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)))){vec4 mark=texture2D(taxiMark,uv);diffuseColor.rgb=mix(diffuseColor.rgb,mark.rgb,mark.a);}}`
          : "") +
        `
   } else if(vPart<2.5&&vPart>1.5)diffuseColor.rgb=vec3(.025,.042,.065);
   else if(vPart<3.5&&vPart>2.5)diffuseColor.rgb=vec3(.45,.47,.49);
   else if(vPart<4.5&&vPart>3.5)diffuseColor.rgb=vec3(.94,.89,.76);
   else if(vPart<5.5&&vPart>4.5)diffuseColor.rgb=vec3(.60,.012,.006);
   else if(vPart<6.5&&vPart>5.5)diffuseColor.rgb=vec3(.80,.75,.62);
   else if(vPart>6.5)diffuseColor.rgb=vec3(.012,.013,.015);
  `,
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nroughnessFactor=vPart>6.5?.82:(abs(vPart-2.)<.4?.10:.24);",
    );
    s.fragmentShader = s.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\nif(abs(vPart-4.)<.45)totalEmissiveRadiance+=vec3(3.2,2.65,1.83);if(abs(vPart-5.)<.45)totalEmissiveRadiance+=vec3(2.55,.015,.004);",
    );
  };
  mat.customProgramCacheKey = () => (name === "taxi" ? "taxi" : "sedan");
  const m = new T.InstancedMesh(g, mat, capacity);
  m.frustumCulled = false;
  m.count = 0;
  scene.add(m);
  return m;
}
function shadowPool(scene, n) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(4,4,9,.83)");
  g.addColorStop(0.42, "rgba(4,4,9,.49)");
  g.addColorStop(1, "rgba(4,4,9,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const geo = new T.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new T.InstancedMesh(
    geo,
    new T.MeshBasicMaterial({
      map: new T.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
    n,
  );
  m.frustumCulled = false;
  m.renderOrder = 1;
  scene.add(m);
  return m;
}
export async function population(scene, monument) {
  const clock = { value: 0 },
    people = [],
    cars = [];
  function person(type, x, z, opts = {}) {
    if (!canWalk(x, z) && !opts.statue) return;
    const a = {
      type,
      x,
      z,
      px: x,
      pz: z,
      angle: opts.angle ?? range(-Math.PI, Math.PI),
      phase: random(),
      scale: opts.scale ?? range(0.92, 1.08),
      width: range(0.88, 1.1),
      rate: range(0.8, 1.18),
      shirt: new T.Color(opts.statue ? 0x3b4b47 : pick(tintPalette)),
      ...opts,
    };
    people.push(a);
  }
  function lane(x, z, otherZ) {
    const type = Math.floor(range(0, 4)),
      sign = otherZ > z ? 1 : -1;
    person(type, x, z, {
      dest: otherZ,
      speed: range(0.78, 1.42),
      direction: sign,
      angle: sign > 0 ? 0 : Math.PI,
      travel: Math.abs(otherZ - z),
      offset: range(0, Math.abs(otherZ - z)),
    });
  }
  // Independent sidewalk routes stay outside the steps, street furniture and traffic.
  for (let i = 0; i < 186; i++) {
    const z = range(-133, 77),
      side = i % 4,
      x =
        side === 0
          ? range(-22.75, -20.75)
          : side === 1
            ? range(-5.85, -4.85)
            : side === 2
              ? range(-2.4, -1.6)
              : range(14.4, 15.3);
    const d = range(6.8, 22) * (random() < 0.5 ? 1 : -1);
    if (
      [0, 0.25, 0.5, 0.75, 1].every(
        (f) => canWalk(x, z + d * f) && groundLevel(x, z + d * f) < 0.2,
      )
    )
      lane(x, z, z + d);
  }
  const clusters = [
    [-0.7, 25],
    [7, 14],
    [4, 5],
    [8, -3],
    [4, -12],
    [2, -30],
    [6, -47],
    [-2, -55],
    [0, -72],
    [5, -84],
    [4, -94],
    [13, 29],
    [15, 63],
    [1, 61],
    [8, 74],
    [-21, 42],
    [-21, -17],
    [12.4, 1],
    [10, -61],
  ];
  for (const [x, z] of clusters) {
    const count = Math.floor(range(4, 9));
    for (let j = 0; j < count; j++) {
      const a = j * 2.3999,
        rad = 0.65 + Math.sqrt(j) * 0.74,
        zz = z + Math.sin(a) * rad;
      if (crossStreets.some((st) => Math.abs(st - zz) < 3.6)) continue;
      person(pick([4, 5, 6, 6, 7, 8]), x + Math.cos(a) * rad, zz, {
        angle: -a - Math.PI / 2 + range(-0.7, 0.7),
      });
    }
  }
  for (let i = 0; i < 86; i++) {
    const z = range(-94, 17),
      x = range(-4.1, 12.4),
      dest = z + range(2.3, 9.5) * (i % 2 ? 1 : -1);
    if (
      crossStreets.some(
        (st) => Math.min(z, dest) - 3.8 < st && Math.max(z, dest) + 3.8 > st,
      )
    )
      continue;
    if (canWalk(x, z) && canWalk(x, dest) && canWalk(x, (z + dest) / 2))
      lane(x, z, dest);
  }
  for (let k = 0; k < 33; k++) {
    const x = stair.x + range(-5.6, 5.6),
      z = stair.z + range(0.6, 12.9);
    if (Math.abs(x - 0.1) > 1.0 || Math.abs(z - 40) > 1.6)
      person(pick([4, 5, 6, 7, 8]), x, z, {
        angle: Math.PI + range(-0.75, 0.75),
      });
  }
  for (let k = 0; k < 32; k++) {
    const z = range(-130, 88);
    person(pick([4, 5, 6, 7, 8]), rightEdge(z) - range(1.0, 3.1), z);
  }
  const sedanColors = [
    0x162230, 0x222327, 0x9da0a8, 0x222126, 0x583036, 0xbbb7ae, 0x394650,
  ];
  for (let l = 0; l < 3; l++)
    for (let i = 0; i < 14; i++) {
      const type =
          (l + i) % 5 < 2 ? "taxi" : (l + i) % 3 === 0 ? "suv" : "sedan",
        delta = range(-2, 2);
      cars.push({
        type,
        lane: l,
        x: -17.8 + l * 3.55,
        z: -178 + i * 20 + delta + l * 6,
        angle: Math.PI,
        speed: 4.0 + l * 0.59,
        paint: new T.Color(
          type === "taxi"
            ? pick([0xf9a80b, 0xffb516, 0xf5a318])
            : pick(sedanColors),
        ),
      });
    }
  // Cross traffic uses the cross street while the avenue queue waits.
  for (let j = 0; j < 4; j++) {
    const z = crossStreets[1 + j],
      dir = j % 2 ? 1 : -1;
    for (let i = 0; i < 3; i++) {
      const type = i === 1 ? "taxi" : "sedan";
      cars.push({
        type,
        cross: true,
        x: -89 + i * 42 + j * 8,
        z: z + dir * 0.85,
        dir,
        angle: (dir * Math.PI) / 2,
        paint: new T.Color(type === "taxi" ? 0xffaa0b : pick(sedanColors)),
      });
    }
  }
  const decals = makeTaxiDecal();
  const [types, motors] = await Promise.all([
    Promise.all(
      Array.from({ length: 9 }, (_, i) =>
        actorType(scene, i, people.length, clock),
      ),
    ),
    Promise.all(
      ["taxi", "sedan", "suv"].map((n) =>
        carType(scene, n, cars.length, decals),
      ),
    ),
  ]);
  const vehicles = Object.fromEntries(
    ["taxi", "sedan", "suv"].map((n, i) => [n, motors[i]]),
  );
  const shadows = shadowPool(scene, people.length + cars.length + 1);
  // Monument uses the same anatomical mesh with a bronze surface and a fixed pose.
  const source = types[4][0];
  const statueMat = source.material.clone();
  statueMat.map = null;
  statueMat.color.set(0x48554c);
  statueMat.metalness = 0.7;
  statueMat.roughness = 0.52;
  statueMat.onBeforeCompile = (shader) => {
    source.material.onBeforeCompile(shader);
    shader.uniforms.seconds = { value: 0 };
    shader.fragmentShader = shader.fragmentShader.replace("vCloth);", "0.);");
  };
  statueMat.customProgramCacheKey = () => "bronze";
  const geo = source.geometry.clone();
  geo.setAttribute(
    "outfit",
    new T.InstancedBufferAttribute(new Float32Array([0.13, 0.15, 0.14]), 3),
  );
  geo.setAttribute(
    "cycle",
    new T.InstancedBufferAttribute(new Float32Array([0.5, 0]), 2),
  );
  const statue = new T.InstancedMesh(geo, statueMat, 1);
  statue.setMatrixAt(0, transform(...monument, Math.PI, 1.41));
  statue.frustumCulled = false;
  scene.add(statue);
  const view = v3(0, 0, -1);
  let previousTime = 0;
  for (const car of cars) {
    car.px = car.x;
    car.pz = car.z;
    car.velocity = car.cross ? 4.7 : car.speed;
  }
  function advanceTraffic(t) {
    const dt = Math.min(0.1, Math.max(0, t - previousTime));
    previousTime = t;
    const green = t % 26 < 17;
    for (const car of cars) {
      let clearance = 100;
      if (car.cross) {
        const stop = car.dir > 0 ? -21.9 : -5.7,
          distance = (stop - car.px) * car.dir;
        if ((green || t % 26 < 18) && distance >= 0) clearance = distance;
      } else {
        if (!green)
          for (const z of crossStreets) {
            const distance = car.pz - (z + 6.6);
            if (distance >= 0) clearance = Math.min(clearance, distance);
          }
        for (const other of cars) {
          if (car === other || car.lane !== other.lane) continue;
          clearance = Math.min(clearance, mod(car.pz - other.pz, 280) - 5.45);
        }
      }
      if (car.cross)
        for (const other of cars) {
          if (car === other || other.z !== car.z || !other.cross) continue;
          clearance = Math.min(
            clearance,
            mod((other.px - car.px) * car.dir, 186) - 5.6,
          );
        }
      const max = car.cross ? 5.3 : car.speed,
        desired = Math.min(max, Math.sqrt(3.7 * Math.max(0, clearance - 0.16)));
      car.velocity += Math.max(
        -4 * dt,
        Math.min(1.8 * dt, desired - car.velocity),
      );
      const move = Math.max(0, Math.min(clearance, car.velocity * dt));
      if (car.cross) car.px = mod(car.px + car.dir * move + 93, 186) - 93;
      else car.pz = mod(car.pz - move + 180, 280) - 180;
    }
  }
  function update(t, camera, low) {
    advanceTraffic(t);
    clock.value = t;
    camera.getWorldDirection(view);
    shadows.count = 0;
    for (const lod of types) for (const m of lod) m.count = 0;
    for (const m of motors) m.count = 0;
    const visible = (x, z, maxDist) => {
      const dx = x - camera.position.x,
        dz = z - camera.position.z;
      return (
        dx * dx + dz * dz < maxDist * maxDist &&
        (dx * view.x + dz * view.z > -14 || view.y < -0.62)
      );
    };
    for (const a of people) {
      let z = a.z,
        yaw = a.angle;
      if (a.travel) {
        const p = mod(a.offset + t * a.speed, a.travel * 2),
          rev = p > a.travel;
        z += a.direction * (rev ? 2 * a.travel - p : p);
        const f = (rev ? -1 : 1) * a.direction;
        yaw = f > 0 ? 0 : Math.PI;
        const turn = Math.min(p, Math.abs(p - a.travel), a.travel * 2 - p);
        if (turn < 0.4) yaw += ((rev ? 1 : -1) * (0.4 - turn) * Math.PI) / 0.8;
      }
      a.pz = z;
      a.px = a.x;
      if (!visible(a.x, z, low ? 121 : 165)) continue;
      const dist = Math.hypot(
          a.x - camera.position.x,
          z - camera.position.z,
          camera.position.y,
        ),
        lod = dist < (low ? 5 : 10) ? 0 : dist < (low ? 15 : 26) ? 1 : 2,
        m = types[a.type][lod],
        i = m.count++,
        y = groundLevel(a.x, z);
      m.setMatrixAt(
        i,
        transform(a.x, y, z, yaw, a.scale * a.width, a.scale, a.scale),
      );
      m.geometry.attributes.outfit.setXYZ(i, a.shirt.r, a.shirt.g, a.shirt.b);
      m.geometry.attributes.cycle.setXY(i, a.phase, a.rate);
      if (dist < 66)
        shadows.setMatrixAt(
          shadows.count++,
          transform(a.x, y + 0.015, z, yaw, 0.98, 1, 0.79),
        );
    }
    for (const a of cars) {
      const x = a.px,
        z = a.pz;
      if (!visible(x, z, 170)) continue;
      const m = vehicles[a.type],
        i = m.count++;
      m.setMatrixAt(i, transform(x, 0.045, z, a.angle, 1));
      m.geometry.attributes.paint.setXYZ(i, a.paint.r, a.paint.g, a.paint.b);
      shadows.setMatrixAt(
        shadows.count++,
        transform(x, 0.055, z, a.angle, 2.65, 1, 5.65),
      );
    }
    for (const ls of types)
      for (const m of ls)
        if (m.count) {
          m.instanceMatrix.needsUpdate = true;
          m.geometry.attributes.cycle.needsUpdate = true;
          m.geometry.attributes.outfit.needsUpdate = true;
        }
    for (const m of motors) {
      m.instanceMatrix.needsUpdate = true;
      m.geometry.attributes.paint.needsUpdate = true;
    }
    shadows.instanceMatrix.needsUpdate = true;
  }
  return { update, people, cars };
}
