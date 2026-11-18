import {
  THREE as T,
  Batch,
  v3,
  range,
  random,
  pick,
  texture,
  obstacle,
  stair,
  crossStreets,
} from "./geometry.js";
const white = new T.Color(1, 1, 1),
  warm = new T.Color(2.9, 1.6, 0.72),
  cold = new T.Color(0.56, 1.5, 2.7),
  red = new T.Color(2.7, 0.024, 0.012);
const billboardKeys =
  "wicked phantom jersey aldo conan greyhound express polo lion fashion discovery keys playbill eye ocean galaxy afterhours kodak jazz nasdaq maison alpine colaphoto stride atelier midnight marquee".split(
    " ",
  );
const shops = [
    "boutique",
    "delishop",
    "lobbytheatre",
    "giftshop",
    "lobbyhotel",
    "dinerchrome",
  ],
  fascias = ["hotel", "marriott", "deli", "broadway", "news", "paramount"];
export const rightEdge = (z) => 14 + Math.abs(z + 33) * 0.119;
export async function district(scene) {
  const batch = new Batch(scene),
    maps = {},
    walls = [];
  await Promise.all(
    [
      ...billboardKeys,
      ...shops,
      ...fascias,
      "station",
      "tkts",
      "limestone",
      "curtainwall",
      "wall2",
      "wall5",
      "wall7",
    ].map(async (key) => {
      const map = await texture(key);
      const wall =
        key.startsWith("wall") || key === "limestone" || key === "curtainwall";
      if (wall) {
        map.wrapS = map.wrapT = T.RepeatWrapping;
      }
      const m = new T.MeshBasicMaterial({ map, vertexColors: true });
      maps[key] = m;
      if (!wall) {
        m.onBeforeCompile = (s) => {
          s.fragmentShader = s.fragmentShader.replace(
            "#include <map_fragment>",
            "#include <map_fragment>\nfloat ledCoverage=1.0-smoothstep(.16,.52,fwidth(vMapUv.y)*460.);diffuseColor.rgb*=1.-ledCoverage*(.032+.032*cos(vMapUv.y*2890.));",
          );
        };
      }
    }),
  );
  for (let i = 0; i < 8; i++) walls.push(maps["wall" + i]);
  const box = (...args) => batch.box(...args),
    rod = (...args) => batch.rod(...args),
    tube = (...args) => batch.tube(...args);
  const glow = (x, y, z, w, h, d, col, angle = 0) =>
    box(x, y, z, w, h, d, col, angle, batch.lit);
  function facade(x, z, w, h, d, style, angle = 0, base = 0, tint = 1) {
    const stone = [0, 3, 6].includes(style),
      glass = [1, 4].includes(style);
    const m = stone
      ? maps.limestone
      : glass
        ? maps.curtainwall
        : walls[style % 8];
    const light = tint * (stone ? 0.66 : glass ? 0.72 : 0.67);
    const c = new T.Color(light, light, light * 1.035);
    box(x, base + h / 2, z, w, h, d, c, angle, m, [
      w / (stone ? 24 : 31),
      h / (stone ? 29 : 36),
      d / (stone ? 24 : 31),
    ]);
  }
  const lensRed = new T.MeshBasicMaterial({
      color: 0xff2410,
      vertexColors: true,
    }),
    lensGreen = new T.MeshBasicMaterial({
      color: 0x21ff94,
      vertexColors: true,
    });
  const rotatingDisplays = [];
  function wrappedScreen(edge, a, b, width) {
    const x = edge - 2.5,
      corner = 4.1,
      z = b + 1.2,
      points = [
        [x, a + 0.3],
        [x, z - corner],
      ];
    for (let i = 1; i <= 22; i++) {
      const q = ((i / 22) * Math.PI) / 2;
      points.push([
        x + corner * (1 - Math.cos(q)),
        z - corner + corner * Math.sin(q),
      ]);
    }
    points.push([edge + width - 1.7, z]);
    const h = 12.7,
      base = 6.05,
      lengths = [0],
      p = [],
      uv = [],
      idx = [];
    for (let i = 1; i < points.length; i++)
      lengths.push(
        lengths[i - 1] +
          Math.hypot(
            points[i][0] - points[i - 1][0],
            points[i][1] - points[i - 1][1],
          ),
      );
    for (let i = 0; i < points.length; i++) {
      const [xx, zz] = points[i],
        u = lengths[i] / lengths.at(-1);
      p.push(xx, base, zz, xx, base + h, zz);
      uv.push(u, 0, u, 1);
      if (!i) continue;
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k, k + 1, k - 1);
      const prev = points[i - 1];
      for (const y of [base - 0.12, base + h + 0.12])
        rod([prev[0], y, prev[1]], [xx, y, zz], 0.14, 0x38393f);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute("position", new T.Float32BufferAttribute(p, 3));
    geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const material = new T.MeshBasicMaterial({
      map: maps.marquee.map,
      color: new T.Color(1.62, 1.62, 1.62),
    });
    scene.add(new T.Mesh(geo, material));
  }
  function panel(x, y, z, w, h, yaw, key, opt = {}) {
    const sx = Math.sin(yaw),
      cz = Math.cos(yaw),
      offset = opt.offset ?? 0.3,
      frame = opt.frame ?? 0.28;
    box(
      x,
      y,
      z,
      w + frame * 2,
      h + frame * 2,
      0.55,
      opt.steel ?? 0x282b32,
      yaw,
    );
    const power = opt.power ?? 1.34;
    batch.plane(
      x + sx * offset,
      y,
      z + cz * offset,
      w,
      h,
      yaw,
      maps[key],
      new T.Color(power, power, power),
    );
    if (opt.rim) {
      const tx = Math.cos(yaw),
        tz = -sx;
      for (const sign of [-1, 1])
        glow(
          x + sign * tx * (w / 2 + 0.1) + sx * 0.3,
          y,
          z + sign * tz * (w / 2 + 0.1) + cz * 0.3,
          0.11,
          h + 0.3,
          0.09,
          opt.rim,
          yaw,
        );
    }
    if (opt.truss) {
      const dx = Math.cos(yaw),
        dz = -sx;
      for (let u = -w * 0.45; u <= w * 0.45; u += 2.8) {
        const xx = x + dx * u - sx * 0.55,
          zz = z + dz * u - cz * 0.55;
        rod(
          [xx, y - h / 2 - 1.5, zz],
          [xx, y + h / 2 + 0.15, zz],
          0.078,
          0x56575b,
        );
        rod(
          [xx, y - h / 2 - 1.4, zz],
          [xx + dx * 2, y - h / 2, zz + dz * 2],
          0.05,
          0x737780,
        );
      }
      box(x, y - h * 0.5 - 0.63, z, w + 0.6, 0.12, 1.1, 0x606269, yaw);
    }
  }
  function decoSlab(x, z, w, y, d, angle = 0) {
    box(x, y, z, w, 0.43, d, 0x626068, angle);
    box(x, y - 0.37, z, w - 0.25, 0.22, d - 0.25, 0x252931, angle);
  }
  // Four distinct street corners per block. The east side follows Seventh Avenue;
  // the west side follows Broadway's diagonal as it opens away from the crossing.
  const east = [
    ["jersey", "conan", "aldo", "kodak", 0, 61],
    ["discovery", "eye", "fashion", "jazz", 4, 100],
    ["aldo", "jazz", "galaxy", "discovery", 7, 72],
    ["eye", "midnight", "jersey", "atelier", 0, 109],
    ["stride", "maison", "keys", "atelier", 3, 69],
    ["midnight", "stride", "jazz", "polo", 6, 89],
    ["ocean", "aldo", "galaxy", "playbill", 1, 73],
  ];
  const west = [
    ["galaxy", "keys", "polo", "express", 1, 97],
    ["discovery", "nasdaq", "aldo", "ocean", 2, 114],
    ["polo", "fashion", "lion", "playbill", 3, 76],
    ["wicked", "phantom", "jersey", "lion", 6, 89],
    ["maison", "atelier", "polo", "midnight", 4, 96],
    ["atelier", "alpine", "kodak", "conan", 7, 76],
    ["jazz", "galaxy", "aldo", "jersey", 2, 105],
  ];
  for (let side of [-1, 1]) {
    for (let j = 0; j < 7; j++) {
      const a = (j === 0 ? -189 : crossStreets[j - 1]) + 4.8,
        b = crossStreets[j] - 4.8,
        depth = b - a,
        z = (a + b) / 2;
      const e = side < 0 ? -23.5 : rightEdge(z),
        width = range(21, 31),
        x = e + (side * width) / 2;
      const layout = (side < 0 ? east : west)[j],
        style = layout[4],
        height = layout[5],
        yaw = side < 0 ? Math.PI / 2 : -Math.PI / 2;
      const tilt = side > 0 ? (z > -33 ? 0.113 : -0.113) : 0;
      const ang = -tilt;
      const front = (u, protrude = 0) => [
        e + side * (u * Math.sin(ang) * side - protrude),
        z + u * Math.cos(ang),
      ];
      // The podium and set-back towers have independent material and roof profiles.
      const podium = [17, 16.8, 19, 23, 19, 15, 18][j] + (side > 0 ? 1.4 : 0);
      facade(x, z, width, podium, depth, style, ang);
      obstacle(x, z, width, depth, ang);
      const x2 = x + side * 2.25;
      facade(
        x2,
        z,
        width - 4.8,
        height - podium,
        depth - 2.3,
        style,
        ang,
        podium,
        0.86,
      );
      decoSlab(x, z, width + 0.45, podium + 0.15, depth + 0.45, ang);
      if ([0, 3, 6, 7].includes(style)) {
        for (let y = 8; y < height; y += 13.8)
          decoSlab(x2, z, width - 4.1, y, depth - 1.65, ang);
        for (let u = -depth * 0.47; u < depth * 0.48; u += 4.1) {
          const [fx, fz] = front(u, -0.1);
          box(fx, 11, fz, 0.47, 17, 0.51, 0x554f50, ang);
        }
        facade(
          x2 + side * 1.4,
          z,
          width - 8,
          8,
          depth - 8,
          style,
          ang,
          height,
          0.8,
        );
      } else {
        for (let u = -depth * 0.43; u < depth * 0.47; u += 3.4) {
          const [fx, fz] = front(u, -4.3);
          box(
            fx,
            (height + podium) * 0.5,
            fz,
            0.22,
            height - podium,
            0.23,
            0x667181,
            ang,
          );
        }
        box(x2, height + 0.65, z, width - 4, 1.3, depth - 2, 0x454853, ang);
      }
      box(x2, height + 2.05, z, width * 0.37, 3.9, depth * 0.45, 0x323940, ang);
      for (let m = 0; m < 3; m++)
        tube(
          x2 + range(-6, 6),
          height + 3.7,
          z + range(-5, 5),
          0.13,
          6.9,
          0x43464f,
        );
      // Recessed shop bays, doors, lit fascia and individual awning bulbs.
      const shopCount = 3,
        seg = depth / shopCount;
      for (let k = 0; k < shopCount; k++) {
        const [fx, fz] = front(-depth / 2 + (k + 0.5) * seg, 0.24);
        const head = yaw + ang;
        panel(
          fx,
          2.05,
          fz,
          seg - 0.22,
          3.9,
          head,
          shops[(k + j * 2 + (side > 0 ? 1 : 0)) % shops.length],
          { power: 0.77, frame: 0.045 },
        );
        panel(
          fx,
          4.52,
          fz,
          seg - 0.12,
          0.83,
          head,
          fascias[(j * 2 + k + (side > 0 ? 1 : 0)) % fascias.length],
          { power: 1.25, frame: 0.06 },
        );
        box(fx - side * 0.75, 4.06, fz, 1.65, 0.2, seg - 0.2, 0x31353c, ang);
        for (let u = -seg * 0.43; u < seg * 0.47; u += 1.65)
          glow(fx - side * 1.43, 3.96, fz + u, 0.15, 0.08, 0.17, warm);
        for (let u = -seg * 0.5; u < seg * 0.47; u += 2.15)
          box(fx - side * 0.34, 1.84, fz + u, 0.085, 3.5, 0.085, 0x3d4045, ang);
      }
      // Street-facing media is composed by corner rather than repeated in a grid.
      const high = [11, 14, 13, 16, 16, 14, 12][j],
        mainW = depth * (j % 3 === 0 ? 0.57 : 0.91);
      const [fx, fz] = front(j % 3 === 0 ? -depth * 0.18 : 0, 0.66);
      const curved = side > 0 && j === 4;
      if (curved) wrappedScreen(e, a, b, width);
      else
        panel(fx, 5.75 + high / 2, fz, mainW, high, yaw + ang, layout[0], {
          truss: true,
          rim: j % 3 === 0 ? warm : null,
        });
      if (j % 3 === 0) {
        const [qx, qz] = front(depth * 0.3, 0.68);
        panel(
          qx,
          5.75 + high / 2,
          qz,
          depth * 0.34,
          high,
          yaw + ang,
          layout[1],
          { rim: warm },
        );
      }
      if (j === 3 || j === 4 || j === 2 || j === 1) {
        const [qx, qz] = front(depth * 0.13, -0.25);
        panel(
          qx,
          high + 11.4,
          qz,
          depth * (j % 2 ? 0.7 : 0.61),
          9.8,
          yaw + ang,
          layout[2],
          { truss: true },
        );
      }
      // Large return panels address the long view down the avenue.
      const faceZ = b + 0.21,
        fw = width * 0.77;
      if (!curved)
        panel(x - side * 0.9, 12.7, faceZ, fw, 13.7, ang, layout[1], {
          truss: true,
        });
      if (j !== 5)
        panel(
          x + side * 0.2,
          25.8,
          faceZ - 0.66,
          fw * 0.92,
          11.4,
          ang,
          layout[3],
          { truss: true, power: 1.16 },
        );
      const bladeX = e - side * 0.96,
        bladeZ = b - 1.75;
      if (j % 2 === 0 || j === 3)
        panel(bladeX, 15.7, bladeZ, 3.5, 17.5, ang + 0.18 * side, layout[2], {
          rim: j === 3 ? warm : cold,
        });
      // Opposite return at each cross street keeps the reverse walk fully developed.
      panel(x, 9.5, a - 0.45, width * 0.72, 8.4, Math.PI + ang, layout[3], {
        power: 0.95,
      });
    }
  }
  // One Times Square: narrow north face, stacked screens, rooftop steelwork and ball.
  const tz = -113,
    tw = 13.2,
    td = 29,
    th = 72,
    face = tz + td / 2;
  facade(1, tz, tw, th, td, 2);
  obstacle(1, tz, tw, td);
  const stack = [
    ["alpine", 3.8, 11.2],
    ["nasdaq", 15.7, 3],
    ["colaphoto", 19.35, 18.1],
    ["afterhours", 38.2, 11],
    ["galaxy", 50, 17.6],
  ];
  // Only two displays change creative, with a short dissolve and long holds.
  for (const [key, next, delay] of [
    ["galaxy", "alpine", 7],
    ["discovery", "stride", 12],
  ]) {
    const material = maps[key],
      previousCompile = material.onBeforeCompile,
      blend = { value: 0 };
    rotatingDisplays.push([blend, delay]);
    material.onBeforeCompile = function (shader) {
      previousCompile.call(this, shader);
      shader.uniforms.nextImage = { value: maps[next].map };
      shader.uniforms.adMix = blend;
      shader.fragmentShader =
        "uniform sampler2D nextImage;uniform float adMix;\n" +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <map_fragment>",
        "diffuseColor *= mix(texture2D(map,vMapUv),texture2D(nextImage,vMapUv),adMix);",
      );
    };
    material.customProgramCacheKey = () => "rotating-display";
  }
  for (const [key, base, h] of stack) {
    panel(1, base + h / 2, face + 0.38, tw - 1.05, h, 0, key, {
      frame: 0.24,
      offset: 0.31,
      power: key === "colaphoto" ? 1.58 : 1.42,
    });
    for (const side of [-1, 1])
      panel(
        1 + side * (tw * 0.5 + 0.42),
        base + h / 2,
        tz + 3.4,
        td * 0.72,
        h,
        (side * Math.PI) / 2,
        key,
        { power: 1.04 },
      );
  }
  for (const sign of [-1, 1]) {
    box(1 + sign * (tw / 2 - 0.03), 36, face + 0.59, 0.25, 71, 0.33, 0x4b505b);
    for (let y = 5; y < th; y += 4.4)
      box(
        1 + sign * (tw / 2 - 0.05),
        y,
        face + 0.76,
        0.66,
        0.15,
        0.86,
        0x596372,
      );
  }
  decoSlab(1, tz, tw + 1, th, td + 1);
  for (const x of [-4, 1, 6]) {
    rod([x, th + 0.2, face - 1], [x, th + 4.2, face - 1], 0.085, 0x7d838b);
    rod(
      [x, th + 0.3, face - 1],
      [x + 1.55, th + 4.2, face - 1],
      0.055,
      0x676c77,
    );
  }
  tube(1, th + 4, tz + 6, 0.12, 8, 0x9297a2);
  const ball = new T.Mesh(
    new T.IcosahedronGeometry(1.17, 2),
    new T.MeshStandardMaterial({
      color: 0xc8e6ff,
      emissive: 0x74bbfb,
      emissiveIntensity: 0.7,
      roughness: 0.22,
      metalness: 0.65,
      flatShading: true,
    }),
  );
  ball.position.set(1, th + 6.5, tz + 6);
  scene.add(ball);
  // High-rise street walls behind the advertising canyon and through its side streets.
  for (let side of [-1, 1])
    for (let r = 0; r < 2; r++)
      for (let j = 0; j < 17; j++) {
        const z = -260 + j * 24 + range(-5, 5),
          x = side * (63 + r * 37 + range(-5, 9)),
          w = range(15, 29),
          d = range(15, 25),
          h = range(43, 143),
          sty = Math.floor(range(0, 8));
        facade(x, z, w, h, d, sty, 0, 0, range(0.49, 0.77));
        if (j % 3 !== 2)
          facade(x, z, w * 0.76, range(6, 22), d * 0.77, sty, 0, h, 0.65);
        if (j % 4 === 0) tube(x, h + 8, z, 0.18, 18, 0x424553);
      }
  for (let s of [-1, 1])
    for (let j = 0; j < 12; j++) {
      const x = (j - 5.5) * 12.5,
        z = s > 0 ? range(136, 182) : range(-251, -194),
        h = range(29, 135);
      facade(
        x,
        z,
        range(9, 19),
        h,
        range(13, 32),
        Math.floor(range(0, 8)),
        0,
        0,
        0.64,
      );
    }
  // Duffy Square glass stair pavilion, polished stainless guards and dividers.
  const st = stair,
    end = st.z + st.count * st.tread;
  for (let k = 0; k < st.count; k++) {
    const h = (k + 1) * st.rise,
      y = 0.08,
      z = st.z + (k + 0.5) * st.tread;
    box(st.x, y + h / 2, z, st.width, h, st.tread + 0.01, 0x641021);
    glow(
      st.x,
      y + h - 0.03,
      z,
      st.width,
      0.065,
      st.tread - 0.018,
      new T.Color(0.94, 0.015, 0.04),
    );
    glow(
      st.x,
      y + h - 0.1,
      z - st.tread * 0.5,
      st.width,
      0.075,
      0.024,
      new T.Color(2.4, 0.018, 0.043),
    );
  }
  for (let side of [-1, 1]) {
    const x = st.x + side * st.width * 0.51;
    rod([x, 1.05, st.z], [x, st.count * st.rise + 1.05, end], 0.042, 0xc7c9cc);
    for (let k = 0; k <= st.count; k += 3)
      tube(x, k * st.rise + 0.55, st.z + k * st.tread, 0.034, 1.08, 0xc5c5c3);
  }
  panel(st.x, 2.03, end + 0.24, 6, 1.75, 0, "tkts", { power: 1.2 });
  obstacle(st.x, end + 0.13, st.width, 0.18);
  // Statue pedestal in the plaza and long, beveled-looking stone seats.
  const monument = [4.3, 25.1];
  const [mx, mz] = monument;
  box(mx, 0.18, mz, 2.65, 0.33, 2.35, 0x4d5356);
  box(mx, 0.44, mz, 2.35, 0.21, 2.09, 0x646a6c);
  box(mx, 1.03, mz, 1.92, 1, 1.76, 0x676867);
  box(mx, 1.65, mz, 2.08, 0.27, 1.95, 0x767775);
  const crossZ = mz + 0.66;
  box(mx, 3.25, crossZ, 0.37, 3.2, 0.28, 0x8a8580);
  box(mx, 4.1, crossZ, 1.47, 0.34, 0.29, 0x8a8580);
  batch.put(
    new T.TorusGeometry(0.46, 0.08, 8, 32),
    batch.mat,
    mx,
    4.1,
    crossZ,
    1,
    1,
    1,
    0,
    0,
    0,
    0x918c85,
  );
  const plaque = document.createElement("canvas");
  plaque.width = 512;
  plaque.height = 256;
  const ctx = plaque.getContext("2d");
  ctx.fillStyle = "#3a3830";
  ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = "#a39472";
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, 492, 236);
  ctx.fillStyle = "#c2ad86";
  ctx.textAlign = "center";
  ctx.font = "28px Georgia";
  ctx.fillText("FATHER", 256, 70);
  ctx.font = "bold 37px Georgia";
  ctx.fillText("FRANCIS P. DUFFY", 256, 127);
  ctx.font = "22px Georgia";
  ctx.fillText("1871  –  1932", 256, 190);
  const plaqueMap = new T.CanvasTexture(plaque);
  plaqueMap.colorSpace = T.SRGBColorSpace;
  const plaqueMat = new T.MeshBasicMaterial({
    map: plaqueMap,
    vertexColors: true,
  });
  for (const direction of [-1, 1])
    batch.plane(
      mx,
      1.08,
      mz + direction * 0.888,
      1.34,
      0.65,
      direction < 0 ? Math.PI : 0,
      plaqueMat,
    );
  obstacle(mx, mz, 2.5, 2.35);
  const benches = [
    [-4, 6],
    [8.6, -13],
    [4.3, -43],
    [9.3, 57],
    [-3.8, 74],
  ];
  for (const [x, z] of benches) {
    box(x, 0.32, z, 0.98, 0.5, 5.7, 0x5d6064, 0.1);
    box(x, 0.57, z, 1.03, 0.06, 5.8, 0x8d8e8c, 0.1);
    obstacle(x, z, 1.05, 5.8, 0.1);
  }
  // Street poles, vehicle signals, pedestrian lenses and suspended street signs.
  const streetSign = (label) => {
    const cv = document.createElement("canvas");
    cv.width = 512;
    cv.height = 120;
    const c = cv.getContext("2d");
    c.fillStyle = "#0b513c";
    c.fillRect(0, 0, 512, 120);
    c.strokeStyle = "#aec8b5";
    c.lineWidth = 4;
    c.strokeRect(4, 4, 504, 112);
    c.textAlign = "center";
    c.fillStyle = "#f7f5e7";
    c.font = "bold 74px Arial";
    c.fillText(label, 256, 87);
    const tex = new T.CanvasTexture(cv);
    tex.colorSpace = T.SRGBColorSpace;
    return new T.MeshBasicMaterial({
      map: tex,
      vertexColors: true,
      side: T.DoubleSide,
    });
  };
  const avenue = streetSign("7 AV"),
    broad = streetSign("Broadway"),
    lights = [];
  function lamppost(x, z, side, signal, idx) {
    tube(x, 0.48, z, 0.19, 0.92, 0x45484e);
    tube(x, 3.85, z, 0.082, 7.5, 0x59606a);
    const tip = x + side * 3.25;
    rod([x, 6.76, z], [x + side * 0.82, 7.68, z], 0.064, 0x5d636c);
    rod([x + side * 0.82, 7.68, z], [tip, 7.67, z], 0.054, 0x666b73);
    box(tip, 7.6, z, 0.76, 0.17, 0.34, 0x4d5058);
    glow(tip, 7.49, z, 0.62, 0.06, 0.26, warm);
    lights.push([tip, 7.45, z, 0.73, 1, 0.76, 0.45]);
    if (signal) {
      const cx = x + side * 5.5;
      rod([x, 6.3, z], [cx, 5.83, z], 0.088, 0x5a6069);
      box(cx, 5.28, z, 0.44, 1.13, 0.41, 0xcb871b);
      for (let j = 0; j < 3; j++) {
        tube(cx, 5.63 - j * 0.34, z + 0.228, 0.13, 0.1, 0x171813, Math.PI / 2);
        tube(
          cx,
          5.63 - j * 0.34,
          z + 0.295,
          0.102,
          0.013,
          j === 1 ? 0x432b1a : 0xffffff,
          Math.PI / 2,
          0,
          j === 0 ? lensRed : j === 2 ? lensGreen : batch.lit,
        );
      }
      box(x + side * 0.21, 3.18, z, 0.49, 0.58, 0.46, 0xb27c27);
      glow(
        x + side * 0.21,
        3.21,
        z + 0.235,
        0.19,
        0.23,
        0.024,
        new T.Color(1.9, 0.21, 0.03),
      );
      batch.plane(
        x,
        4.45,
        z + 0.12,
        2.1,
        0.48,
        0,
        streetSign("W " + (42 + idx) + " ST"),
      );
      batch.plane(
        x + 0.13,
        4.96,
        z,
        1.65,
        0.42,
        Math.PI / 2,
        side > 0 ? avenue : broad,
      );
    }
  }
  for (let j = 0; j < crossStreets.length; j++) {
    const z = crossStreets[j];
    lamppost(-20.45, z - 4.4, 1, true, j);
    lamppost(-6.42, z + 4.35, -1, true, j);
    lamppost(rightEdge(z) - 2.2, z - 4.6, -1, false, j);
  }
  for (let z = -137; z < 92; z += 4.3) {
    if (crossStreets.some((a) => Math.abs(z - a) < 4.2)) continue;
    for (const x of [-7.1, -20.1]) {
      tube(x, 0.412, z, 0.125, 0.78, 0x95959a);
      tube(x, 0.12, z, 0.151, 0.18, 0x61666c);
      tube(x, 0.765, z, 0.128, 0.06, 0xb2afb1);
      tube(x, 0.637, z, 0.13, 0.026, 0xe2d9b8);
    }
  }
  for (let z = -129; z < 87; z += 19.2) {
    const x = rightEdge(z) - 1.7;
    tube(x, 0.55, z, 0.27, 1.02, 0x40474a, 0, 0, batch.mat, 14);
    for (let k = 0; k < 11; k++) {
      let a = (k * 6.28) / 11;
      tube(
        x + 0.272 * Math.sin(a),
        0.54,
        z + 0.272 * Math.cos(a),
        0.013,
        0.9,
        0x8f9795,
      );
    }
    tube(x, 1.05, z, 0.29, 0.085, 0x626c6e);
    tube(x, 0.99, z, 0.23, 0.1, 0x17171c);
  }
  // Subway entrance at the southern end of the district.
  const ex = 12.7,
    ez = -139;
  box(ex, 0.08, ez, 2.15, 0.1, 4.6, 0x151d22);
  for (const dx of [-1.12, 1.12]) {
    for (const dz of [-2.28, 0, 2.28])
      tube(ex + dx, 0.66, ez + dz, 0.059, 1.25, 0x264537);
    for (const y of [0.5, 1.14])
      rod([ex + dx, y, ez - 2.28], [ex + dx, y, ez + 2.28], 0.05, 0x2a483d);
    tube(ex + dx, 1.5, ez + 2.28, 0.078, 1.13, 0x274536);
    const globe = new T.SphereGeometry(0.21, 14, 10);
    batch.put(
      globe,
      batch.lit,
      ex + dx,
      2.1,
      ez + 2.28,
      1,
      1,
      1,
      0,
      0,
      0,
      new T.Color(0.16, 1.25, 0.55),
    );
  }
  panel(ex, 1.17, ez - 2.3, 2.15, 0.53, Math.PI, "station", {
    power: 0.72,
    frame: 0.045,
  });
  obstacle(ex, ez, 2.25, 4.6);
  // Street kiosks, restaurant umbrellas and small red tables.
  for (const [x, z] of [
    [11, 3],
    [12, 7],
    [9, -35],
    [12.1, 50],
    [13.2, 54],
  ]) {
    tube(x, 1.52, z, 0.036, 3, 0x8a8275);
    const umbrella = new T.ConeGeometry(1.43, 0.47, 8);
    batch.put(umbrella, batch.mat, x, 2.75, z, 1, 1, 1, 0, 0.24, 0, 0xc63035);
    tube(x, 0.79, z, 0.61, 0.07, 0x8c292c);
    tube(x, 0.4, z, 0.045, 0.8, 0x555554);
    for (let n = 0; n < 3; n++) {
      const a = n * 2.1 + 0.2,
        xx = x + Math.sin(a) * 0.86,
        zz = z + Math.cos(a) * 0.86;
      box(xx, 0.43, zz, 0.41, 0.055, 0.41, 0xb23938, a);
      for (const sign of [-1, 1])
        rod(
          [xx + 0.15 * sign, 0.03, zz + 0.14],
          [xx + 0.15 * sign, 0.47, zz - 0.14],
          0.018,
          0x6d3939,
        );
      box(xx, 0.69, zz + 0.2, 0.39, 0.22, 0.035, 0xbd403e, a);
    }
  }
  batch.finish();
  return {
    lights,
    update(t) {
      const green = t % 26 < 17;
      lensRed.color.setRGB(green ? 0.052 : 3.1, 0.007, 0.004);
      lensGreen.color.setRGB(0.004, green ? 2.7 : 0.045, green ? 0.68 : 0.024);
      for (const [mix, delay] of rotatingDisplays) {
        const phase = (t + delay) % 34;
        mix.value =
          T.MathUtils.smoothstep(phase, 16, 17.2) *
          (1 - T.MathUtils.smoothstep(phase, 32.8, 34));
      }
    },
    monument: [mx, 1.79, mz],
  };
}
