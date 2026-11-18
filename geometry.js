import * as THREE from "./vendor/three.module.min.js";
export { THREE };
export const clamp = THREE.MathUtils.clamp;
export const mod = THREE.MathUtils.euclideanModulo;
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
let seed = 134998;
export function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
export const range = (a, b) => a + (b - a) * random();
export const pick = (list) => list[Math.floor(random() * list.length)];
export const textureLoader = new THREE.TextureLoader();
export const images = new Map();
export async function texture(key) {
  if (!images.has(key))
    images.set(
      key,
      (async () => {
        const t = await textureLoader.loadAsync("./assets/" + key + ".webp");
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      })(),
    );
  return images.get(key);
}
export const solids = [];
export const stair = {
  x: 5,
  z: 32.5,
  width: 12.2,
  count: 23,
  tread: 0.6,
  rise: 0.166,
};
export const crossStreets = [-149, -102, -61, -21, 20, 62, 101];
export function groundLevel(x, z) {
  const s = stair;
  if (
    Math.abs(x - s.x) < s.width / 2 &&
    z >= s.z &&
    z < s.z + s.count * s.tread
  )
    return 0.09 + (1 + Math.floor((z - s.z) / s.tread)) * s.rise;
  return 0.095;
}
const cube = new THREE.BoxGeometry(1, 1, 1),
  plane = new THREE.PlaneGeometry(1, 1);
const cylinderCache = new Map();
const matrix = new THREE.Matrix4(),
  normalMatrix = new THREE.Matrix3(),
  vert = new THREE.Vector3(),
  norm = new THREE.Vector3();
const rotation = new THREE.Euler(),
  quat = new THREE.Quaternion(),
  scale = new THREE.Vector3(),
  point = new THREE.Vector3();
export class Batch {
  constructor(scene) {
    this.scene = scene;
    this.buckets = new Map();
    this.mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      metalness: 0.25,
    });
    this.lit = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.mat.envMapIntensity = 0.37;
  }
  put(geo, mat, x, y, z, w, h, d, rx, ry, rz, color = 0xffffff, repeat = null) {
    let b = this.buckets.get(mat);
    if (!b) {
      b = { p: [], n: [], u: [], c: [], i: [] };
      this.buckets.set(mat, b);
    }
    const offset = b.p.length / 3;
    matrix.compose(
      point.set(x, y, z),
      quat.setFromEuler(rotation.set(rx, ry, rz, "YXZ")),
      scale.set(w, h, d),
    );
    normalMatrix.getNormalMatrix(matrix);
    const { position, normal, uv } = geo.attributes,
      c = color?.isColor ? color : new THREE.Color(color);
    for (let i = 0; i < position.count; i++) {
      vert.fromBufferAttribute(position, i).applyMatrix4(matrix);
      norm
        .fromBufferAttribute(normal, i)
        .applyMatrix3(normalMatrix)
        .normalize();
      b.p.push(vert.x, vert.y, vert.z);
      b.n.push(norm.x, norm.y, norm.z);
      b.c.push(c.r, c.g, c.b);
      const ru = repeat
          ? Math.abs(normal.getX(i)) > 0.5
            ? repeat[2]
            : repeat[0]
          : 1,
        rv = repeat ? repeat[1] : 1;
      b.u.push(uv.getX(i) * ru, uv.getY(i) * rv);
    }
    if (geo.index) {
      for (const i of geo.index.array) b.i.push(i + offset);
    } else {
      for (let i = 0; i < position.count; i++) b.i.push(i + offset);
    }
  }
  box(x, y, z, w, h, d, color, ry = 0, material = this.mat, repeat = null) {
    this.put(cube, material, x, y, z, w, h, d, 0, ry, 0, color, repeat);
  }
  plane(x, y, z, w, h, ry, mat, color = 0xffffff) {
    this.put(plane, mat, x, y, z, w, h, 1, 0, ry, 0, color);
  }
  tube(x, y, z, r, h, color, rx = 0, rz = 0, mat = this.mat, sides = 10) {
    if (!cylinderCache.has(sides))
      cylinderCache.set(sides, new THREE.CylinderGeometry(1, 1, 1, sides));
    this.put(cylinderCache.get(sides), mat, x, y, z, r, h, r, rx, 0, rz, color);
  }
  rod(a, b, r, color, mat = this.mat) {
    const dir = v3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = dir.length(),
      q = new THREE.Quaternion().setFromUnitVectors(
        v3(0, 1, 0),
        dir.normalize(),
      ),
      e = new THREE.Euler().setFromQuaternion(q, "YXZ");
    if (!cylinderCache.has(8))
      cylinderCache.set(8, new THREE.CylinderGeometry(1, 1, 1, 8));
    this.put(
      cylinderCache.get(8),
      mat,
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
      r,
      len,
      r,
      e.x,
      e.y,
      e.z,
      color,
    );
  }
  finish() {
    for (const [mat, b] of this.buckets) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(b.u, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(b.c, 3));
      g.setIndex(b.i);
      const mesh = new THREE.Mesh(g, mat);
      this.scene.add(mesh);
    }
    this.buckets.clear();
  }
}
export function obstacle(x, z, w, d, angle = 0) {
  solids.push({
    x,
    z,
    w: w / 2,
    d: d / 2,
    c: Math.cos(angle),
    s: Math.sin(angle),
  });
}
export function canWalk(x, z) {
  if (x < -39 || x > 42 || z < -148 || z > 91) return false;
  for (const o of solids) {
    const dx = x - o.x,
      dz = z - o.z;
    if (
      Math.abs(dx * o.c - dz * o.s) < o.w + 0.24 &&
      Math.abs(dx * o.s + dz * o.c) < o.d + 0.24
    )
      return false;
  }
  return true;
}
export async function binary(name) {
  const res = await fetch("./assets/" + name + ".bin");
  if (!res.ok) throw Error(name);
  const data = await res.arrayBuffer(),
    size = new DataView(data).getUint32(0, true),
    meta = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 4, size)));
  const result = { meta };
  const types = {
    float32: Float32Array,
    uint8: Uint8Array,
    uint16: Uint16Array,
    uint32: Uint32Array,
  };
  for (const [k, [offset, len, type]] of Object.entries(meta.fields))
    result[k] = new types[type](data, 4 + size + offset, len);
  return result;
}
