/**
 * ST-094 — deterministic generator for the creative-style proof assets.
 *
 * Every asset produced here is original artwork authored for this repository.
 * No third-party image, photograph, texture or font outline is used, so the
 * proof carries no external licence obligation.
 *
 * Output is written to `src/style-proof/assets.generated.ts` as base64 data
 * URIs. That is deliberate: the browser preview, the Remotion server render and
 * the Node contract tests then consume byte-identical media with no path
 * resolution, no static-file server and no environment-dependent fetch, which
 * is what makes the AC6 preview/render frame comparison meaningful.
 *
 * The generator is seeded and pure: running it twice produces identical bytes.
 * Re-run with:
 *   pnpm --filter @avlp/scene-library run generate:style-proof-assets
 */

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — seeded per asset, never Math.random.
// ---------------------------------------------------------------------------

function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Minimal raster canvas: the Editorial evidence imagery.
// ---------------------------------------------------------------------------

class Raster {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = new Float64Array(width * height * 3);
  }

  set(x, y, [r, g, b], alpha) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    if (alpha <= 0) return;
    const i = (y * this.width + x) * 3;
    const a = Math.min(1, alpha);
    this.data[i] = this.data[i] * (1 - a) + r * a;
    this.data[i + 1] = this.data[i + 1] * (1 - a) + g * a;
    this.data[i + 2] = this.data[i + 2] * (1 - a) + b * a;
  }

  /** Vertical gradient base. */
  gradient(top, bottom) {
    for (let y = 0; y < this.height; y++) {
      const t = y / (this.height - 1);
      const colour = [
        top[0] + (bottom[0] - top[0]) * t,
        top[1] + (bottom[1] - top[1]) * t,
        top[2] + (bottom[2] - top[2]) * t,
      ];
      for (let x = 0; x < this.width; x++) this.set(x, y, colour, 1);
    }
  }

  /** Soft elliptical light or shadow pool. */
  pool(cx, cy, rx, ry, colour, strength) {
    const x0 = Math.max(0, Math.floor(cx - rx));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + rx));
    const y0 = Math.max(0, Math.floor(cy - ry));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + ry));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        this.set(x, y, colour, strength * (1 - d) * (1 - d));
      }
  }

  /** Axis-aligned quadrilateral with independent top/bottom edges (a slab). */
  slab(points, colour, alpha = 1) {
    const ys = points.map((p) => p[1]);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const y1 = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let y = y0; y <= y1; y++) {
      const spans = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if (a[1] === b[1]) continue;
        const lo = Math.min(a[1], b[1]);
        const hi = Math.max(a[1], b[1]);
        if (y + 0.5 < lo || y + 0.5 >= hi) continue;
        spans.push(a[0] + ((y + 0.5 - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
      }
      spans.sort((l, r) => l - r);
      for (let s = 0; s + 1 < spans.length; s += 2)
        for (
          let x = Math.max(0, Math.floor(spans[s]));
          x <= Math.min(this.width - 1, Math.ceil(spans[s + 1]));
          x++
        ) {
          const coverage =
            Math.min(x + 1, spans[s + 1]) - Math.max(x, spans[s]);
          if (coverage > 0) this.set(x, y, colour, alpha * Math.min(1, coverage));
        }
    }
  }

  /** Directional wood or brushed-metal grain. */
  grain(random, amount, horizontal) {
    const lines = horizontal ? this.height : this.width;
    const offsets = Array.from({ length: lines }, () => (random() - 0.5) * 2);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const n = offsets[horizontal ? y : x] * amount;
        const i = (y * this.width + x) * 3;
        this.data[i] = Math.max(0, Math.min(255, this.data[i] + n));
        this.data[i + 1] = Math.max(0, Math.min(255, this.data[i + 1] + n));
        this.data[i + 2] = Math.max(0, Math.min(255, this.data[i + 2] + n));
      }
  }

  /**
   * Sensor-style noise applied in 2x2 blocks. Correlating neighbouring pixels
   * keeps the imagery from looking vector-flat while leaving PNG's row filters
   * something to predict, which is what keeps these assets a few hundred KiB
   * rather than several MiB.
   */
  noise(random, amount) {
    const block = 3;
    const blocksX = Math.ceil(this.width / block);
    const field = new Float64Array(blocksX * Math.ceil(this.height / block));
    for (let i = 0; i < field.length; i++) field[i] = (random() - 0.5) * amount;
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const n =
          field[Math.floor(y / block) * blocksX + Math.floor(x / block)];
        const i = (y * this.width + x) * 3;
        this.data[i] = Math.max(0, Math.min(255, this.data[i] + n));
        this.data[i + 1] = Math.max(0, Math.min(255, this.data[i + 1] + n));
        this.data[i + 2] = Math.max(0, Math.min(255, this.data[i + 2] + n));
      }
  }

  /** Snap each channel to a fixed step so PNG has fewer distinct values. */
  quantize(step) {
    for (let i = 0; i < this.data.length; i++)
      this.data[i] = Math.round(this.data[i] / step) * step;
  }

  /** Corner falloff, the way a real lens darkens its edges. */
  vignette(strength) {
    const cx = this.width / 2;
    const cy = this.height / 2;
    const max = Math.sqrt(cx * cx + cy * cy);
    for (let y = 0; y < this.height; y++)
      for (let x = 0; x < this.width; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / max;
        const f = 1 - strength * d * d;
        const i = (y * this.width + x) * 3;
        this.data[i] *= f;
        this.data[i + 1] *= f;
        this.data[i + 2] *= f;
      }
  }

  toPngBuffer() {
    this.quantize(6);
    const png = new PNG({ width: this.width, height: this.height });
    for (let i = 0, p = 0; i < this.data.length; i += 3, p += 4) {
      png.data[p] = Math.round(Math.max(0, Math.min(255, this.data[i])));
      png.data[p + 1] = Math.round(Math.max(0, Math.min(255, this.data[i + 1])));
      png.data[p + 2] = Math.round(Math.max(0, Math.min(255, this.data[i + 2])));
      png.data[p + 3] = 255;
    }
    // Fixed deflate settings keep the encoded bytes reproducible.
    return PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: 3 });
  }
}

// ---------------------------------------------------------------------------
// Editorial evidence imagery
// ---------------------------------------------------------------------------

/**
 * A faceted ice cube: three visible faces at different luminance, a rim
 * highlight along the top edges and a specular spot. Drawn as geometry rather
 * than one filled polygon, because a single flat shape reads as a placeholder
 * rather than as the subject the lesson is about.
 */
function drawIceCube(raster, cx, cy, size, surfaceTint) {
  const w = size;
  const h = size * 0.58;
  const lift = size * 0.52;
  // Top face (brightest), front-left face, front-right face (darkest).
  const top = [
    [cx, cy - lift - h],
    [cx + w, cy - lift],
    [cx, cy - lift + h],
    [cx - w, cy - lift],
  ];
  const left = [
    [cx - w, cy - lift],
    [cx, cy - lift + h],
    [cx, cy + h * 0.9],
    [cx - w, cy],
  ];
  const right = [
    [cx, cy - lift + h],
    [cx + w, cy - lift],
    [cx + w, cy],
    [cx, cy + h * 0.9],
  ];
  // Ice is translucent: each face blends the surface tint underneath it.
  const blend = (base, alpha) => [
    base[0] * alpha + surfaceTint[0] * (1 - alpha),
    base[1] * alpha + surfaceTint[1] * (1 - alpha),
    base[2] * alpha + surfaceTint[2] * (1 - alpha),
  ];
  raster.slab(right, blend([176, 200, 216], 0.78), 0.94);
  raster.slab(left, blend([206, 226, 240], 0.8), 0.94);
  raster.slab(top, blend([238, 248, 255], 0.86), 0.96);
  // Internal fracture planes, the thing that makes ice read as ice.
  raster.slab(
    [
      [cx - w * 0.45, cy - lift - h * 0.1],
      [cx - w * 0.05, cy - lift + h * 0.45],
      [cx - w * 0.15, cy - lift + h * 0.6],
      [cx - w * 0.55, cy - lift + h * 0.05],
    ],
    [255, 255, 255],
    0.5,
  );
  raster.slab(
    [
      [cx + w * 0.2, cy - lift - h * 0.35],
      [cx + w * 0.62, cy - lift + h * 0.1],
      [cx + w * 0.5, cy - lift + h * 0.22],
      [cx + w * 0.1, cy - lift - h * 0.22],
    ],
    [255, 255, 255],
    0.42,
  );
  // Rim highlight along the two top edges, then a specular spot.
  for (let t = 0; t <= 1; t += 0.004) {
    const lx = cx - w + w * t;
    const ly = cy - lift - h * t;
    raster.pool(lx, ly, 5, 4, [255, 255, 255], 0.5);
    const rx = cx + w * t;
    const ry = cy - lift - h + h * t;
    raster.pool(rx, ry, 5, 4, [255, 255, 255], 0.42);
  }
  raster.pool(cx - w * 0.25, cy - lift - h * 0.1, w * 0.3, h * 0.3, [255, 255, 255], 0.7);
}

/** Meltwater: a wet sheen under and around the cube. */
function drawMeltPool(raster, cx, cy, radiusX, radiusY, tint) {
  raster.pool(cx, cy, radiusX, radiusY, tint, 0.5);
  raster.pool(cx, cy, radiusX * 0.7, radiusY * 0.7, [236, 244, 250], 0.35);
  raster.pool(cx - radiusX * 0.3, cy - radiusY * 0.2, radiusX * 0.3, radiusY * 0.25, [255, 255, 255], 0.5);
}

function metalSurfacePhoto(width, height, seed, { withIce, withPool }) {
  const random = makeRandom(seed);
  const raster = new Raster(width, height);
  raster.gradient([176, 182, 190], [96, 103, 112]);
  raster.grain(random, 9, true);
  raster.pool(width * 0.32, height * 0.24, width * 0.55, height * 0.5, [238, 242, 247], 0.5);
  raster.pool(width * 0.86, height * 0.9, width * 0.5, height * 0.45, [38, 44, 52], 0.45);
  // Counter edge running across the lower third.
  raster.slab(
    [
      [0, height * 0.72],
      [width, height * 0.66],
      [width, height * 0.72],
      [0, height * 0.78],
    ],
    [70, 76, 84],
    0.55,
  );
  // Metal conducts quickly, so its meltwater pool is wide — the visual claim
  // the comparison scene is making.
  if (withPool)
    drawMeltPool(
      raster,
      width * 0.5,
      height * 0.56,
      width * 0.3,
      height * 0.11,
      [196, 214, 228],
    );
  if (withIce)
    drawIceCube(
      raster,
      width * 0.5,
      height * 0.54,
      Math.min(width, height) * 0.2,
      [150, 160, 172],
    );
  raster.noise(random, 8);
  raster.vignette(0.34);
  return raster;
}

function woodSurfacePhoto(width, height, seed) {
  const random = makeRandom(seed);
  const raster = new Raster(width, height);
  raster.gradient([158, 116, 74], [104, 72, 43]);
  raster.grain(random, 16, true);
  for (let k = 0; k < 7; k++) {
    const y = height * (0.1 + 0.12 * k);
    raster.slab(
      [
        [0, y],
        [width, y - height * 0.02],
        [width, y - height * 0.012],
        [0, y + height * 0.008],
      ],
      [76, 50, 28],
      0.3,
    );
  }
  raster.pool(width * 0.3, height * 0.2, width * 0.6, height * 0.55, [226, 190, 148], 0.35);
  raster.pool(width * 0.88, height * 0.92, width * 0.5, height * 0.4, [42, 27, 14], 0.4);
  // Wood conducts slowly: almost no meltwater, next to the same cube.
  drawMeltPool(
    raster,
    width * 0.5,
    height * 0.56,
    width * 0.1,
    height * 0.035,
    [168, 132, 96],
  );
  drawIceCube(
    raster,
    width * 0.5,
    height * 0.54,
    Math.min(width, height) * 0.2,
    [132, 96, 60],
  );
  raster.noise(random, 8);
  raster.vignette(0.36);
  return raster;
}

function desertPhoto(width, height, seed) {
  const random = makeRandom(seed);
  const raster = new Raster(width, height);
  raster.gradient([238, 196, 140], [176, 122, 72]);
  raster.pool(width * 0.7, height * 0.12, width * 0.5, height * 0.4, [255, 240, 206], 0.75);
  raster.slab(
    [
      [0, height * 0.62],
      [width, height * 0.56],
      [width, height],
      [0, height],
    ],
    [154, 104, 60],
    0.85,
  );
  // Cactus column and two arms.
  const cx = width * 0.42;
  raster.slab(
    [
      [cx - width * 0.045, height * 0.26],
      [cx + width * 0.045, height * 0.26],
      [cx + width * 0.05, height * 0.68],
      [cx - width * 0.05, height * 0.68],
    ],
    [58, 92, 58],
    1,
  );
  raster.slab(
    [
      [cx - width * 0.14, height * 0.42],
      [cx - width * 0.045, height * 0.4],
      [cx - width * 0.045, height * 0.46],
      [cx - width * 0.12, height * 0.5],
    ],
    [64, 100, 62],
    1,
  );
  raster.slab(
    [
      [cx + width * 0.045, height * 0.38],
      [cx + width * 0.15, height * 0.36],
      [cx + width * 0.13, height * 0.44],
      [cx + width * 0.045, height * 0.44],
    ],
    [52, 86, 54],
    1,
  );
  raster.grain(random, 6, false);
  raster.noise(random, 9);
  raster.vignette(0.3);
  return raster;
}

function fernPhoto(width, height, seed) {
  const random = makeRandom(seed);
  const raster = new Raster(width, height);
  raster.gradient([34, 58, 38], [12, 26, 18]);
  raster.pool(width * 0.28, height * 0.18, width * 0.55, height * 0.5, [126, 176, 96], 0.42);
  for (let k = 0; k < 9; k++) {
    const baseY = height * (0.2 + 0.075 * k);
    const lean = (random() - 0.5) * width * 0.1;
    raster.slab(
      [
        [width * 0.12 + lean, baseY],
        [width * 0.86 + lean, baseY - height * 0.05],
        [width * 0.86 + lean, baseY - height * 0.02],
        [width * 0.12 + lean, baseY + height * 0.03],
      ],
      [72, 124, 62],
      0.66,
    );
  }
  raster.grain(random, 7, true);
  raster.noise(random, 10);
  raster.vignette(0.42);
  return raster;
}

// ---------------------------------------------------------------------------
// Vector artwork: Essential cutouts and the Everyday illustration family.
// ---------------------------------------------------------------------------

/** The Everyday family shares one vocabulary: 8px dark outline, flat fills,
 * rounded corners, one warm accent, one teal accent. */
const everydayInk = "#28303B";
const everydayWarm = "#EF6C4D";
const everydayTeal = "#2AA198";
const everydaySand = "#F6C56B";

const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">${body}</svg>`;

const vectors = {
  "essential-subject-icecube": svg(
    520,
    520,
    `<g fill="none" stroke="#14161A" stroke-width="10" stroke-linejoin="round">
      <path d="M150 190 260 130 370 190 370 330 260 392 150 330Z" fill="#DCE9F2"/>
      <path d="M150 190 260 252 370 190"/><path d="M260 252 260 392"/>
    </g>`,
  ),
  "essential-subject-metal": svg(
    520,
    520,
    `<g stroke="#14161A" stroke-width="10" stroke-linejoin="round">
      <path d="M110 250 260 180 410 250 410 330 260 400 110 330Z" fill="#B9C0C8"/>
      <path d="M110 250 260 320 410 250" fill="none"/>
      <path d="M260 320 260 400" fill="none"/>
      <path d="M170 236 236 205M212 258 278 227M254 280 320 249" fill="none" stroke-width="6" opacity="0.55"/>
    </g>`,
  ),
  "essential-subject-wood": svg(
    520,
    520,
    `<g stroke="#14161A" stroke-width="10" stroke-linejoin="round">
      <path d="M110 250 260 180 410 250 410 330 260 400 110 330Z" fill="#C08B57"/>
      <path d="M110 250 260 320 410 250" fill="none"/>
      <path d="M260 320 260 400" fill="none"/>
      <path d="M126 268 260 330M126 292 260 354M394 268 262 330" fill="none" stroke-width="6" opacity="0.5"/>
    </g>`,
  ),
  "essential-subject-cactus": svg(
    520,
    520,
    `<g stroke="#14161A" stroke-width="10" stroke-linejoin="round" fill="#4E7F52">
      <rect x="226" y="120" width="68" height="300" rx="34"/>
      <path d="M226 240H170a26 26 0 0 0-26 26v54"/>
      <path d="M294 212h50a26 26 0 0 1 26 26v40"/>
      <path d="M144 320a26 26 0 0 0 26-26" fill="none"/>
    </g>
    <g stroke="#14161A" stroke-width="5" stroke-linecap="round">
      <path d="M226 170h-16M226 210h-16M294 190h16M294 250h16"/>
    </g>`,
  ),
  "essential-subject-fern": svg(
    520,
    520,
    `<g stroke="#14161A" stroke-width="10" stroke-linecap="round" fill="none">
      <path d="M260 430V110"/>
      ${Array.from({ length: 6 }, (_, i) => {
        const y = 150 + i * 46;
        const w = 150 - i * 14;
        return `<path d="M260 ${y}c-${w} -18 -${w} 40 -${w * 0.2} 34" fill="#5B9A5F"/><path d="M260 ${y}c${w} -18 ${w} 40 ${w * 0.2} 34" fill="#5B9A5F"/>`;
      }).join("")}
    </g>`,
  ),
  "essential-subject-leaf": svg(
    520,
    520,
    `<g stroke="#14161A" stroke-width="10" stroke-linejoin="round">
      <path d="M260 90c130 70 150 230 0 340C110 320 130 160 260 90Z" fill="#6BA96F"/>
      <path d="M260 120v300" fill="none"/>
      <path d="M260 200 180 180M260 250 175 240M260 300 185 302M260 200 340 180M260 250 345 240M260 300 335 302" fill="none" stroke-width="6" opacity="0.6"/>
    </g>`,
  ),
  "everyday-illustration-kitchen": svg(
    760,
    520,
    `<rect x="0" y="0" width="760" height="520" fill="none"/>
    <g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <rect x="60" y="330" width="640" height="46" rx="14" fill="${everydaySand}"/>
      <rect x="120" y="236" width="220" height="96" rx="16" fill="#B9C0C8"/>
      <rect x="420" y="236" width="220" height="96" rx="16" fill="#C08B57"/>
      <path d="M198 236 214 190 262 176 300 200 288 236Z" fill="#DCE9F2"/>
      <path d="M498 236 514 190 562 176 600 200 588 236Z" fill="#DCE9F2"/>
    </g>
    <g stroke="${everydayWarm}" stroke-width="8" stroke-linecap="round">
      <path d="M230 160v-34M262 154v-44M292 162v-30"/>
    </g>`,
  ),
  "everyday-illustration-particles": svg(
    760,
    520,
    `<g stroke="${everydayInk}" stroke-width="8">
      <rect x="70" y="180" width="620" height="170" rx="26" fill="#FFFFFF"/>
    </g>
    <g stroke="${everydayInk}" stroke-width="7">
      ${Array.from({ length: 7 }, (_, i) => `<circle cx="${140 + i * 82}" cy="265" r="30" fill="${i < 3 ? everydayWarm : i === 3 ? everydaySand : everydayTeal}"/>`).join("")}
    </g>
    <g stroke="${everydayInk}" stroke-width="7" stroke-linecap="round" fill="none">
      ${Array.from({ length: 6 }, (_, i) => `<path d="M${176 + i * 82} 265h${82 - 72}"/>`).join("")}
    </g>`,
  ),
  "everyday-illustration-metal": svg(
    600,
    520,
    `<g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <rect x="70" y="300" width="460" height="96" rx="18" fill="#B9C0C8"/>
      <path d="M232 300 250 236 330 216 390 252 372 300Z" fill="#DCE9F2"/>
    </g>
    <g stroke="${everydayWarm}" stroke-width="9" stroke-linecap="round">
      <path d="M150 300v-46M210 300v-70M400 300v-70M460 300v-46"/>
    </g>
    <g stroke="${everydayInk}" stroke-width="8">
      <ellipse cx="300" cy="404" rx="120" ry="20" fill="${everydayTeal}"/>
    </g>`,
  ),
  "everyday-illustration-wood": svg(
    600,
    520,
    `<g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <rect x="70" y="300" width="460" height="96" rx="18" fill="#C08B57"/>
      <path d="M232 300 250 236 330 216 390 252 372 300Z" fill="#DCE9F2"/>
    </g>
    <g stroke="${everydayWarm}" stroke-width="9" stroke-linecap="round" opacity="0.4">
      <path d="M210 300v-22M400 300v-22"/>
    </g>
    <g stroke="${everydayInk}" stroke-width="8">
      <ellipse cx="300" cy="404" rx="42" ry="12" fill="${everydayTeal}"/>
    </g>`,
  ),
  "everyday-illustration-desert": svg(
    760,
    520,
    `<g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <circle cx="620" cy="120" r="56" fill="${everydaySand}"/>
      <path d="M40 400c120-60 240-60 340 0s240 60 340 0v100H40Z" fill="#E4B071"/>
      <rect x="320" y="180" width="76" height="230" rx="38" fill="#5B9A5F"/>
      <path d="M320 280h-64a28 28 0 0 0-28 28v52" fill="none"/>
      <path d="M396 250h60a28 28 0 0 1 28 28v40" fill="none"/>
    </g>`,
  ),
  "everyday-illustration-pores": svg(
    760,
    520,
    `<g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <path d="M380 70c180 96 200 300 0 400-200-100-180-304 0-400Z" fill="#6BA96F"/>
      <path d="M380 110v320" fill="none"/>
    </g>
    <g stroke="${everydayInk}" stroke-width="6">
      ${Array.from({ length: 5 }, (_, i) => `<ellipse cx="${300 + (i % 2) * 160}" cy="${180 + i * 52}" rx="26" ry="15" fill="${everydayTeal}"/>`).join("")}
    </g>
    <g stroke="${everydayWarm}" stroke-width="8" stroke-linecap="round">
      <path d="M300 160v-42M460 212v-42M300 264v-42"/>
    </g>`,
  ),
  "everyday-illustration-cactus": svg(
    600,
    520,
    `<g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <rect x="70" y="392" width="460" height="64" rx="18" fill="#E4B071"/>
      <rect x="262" y="150" width="76" height="242" rx="38" fill="#5B9A5F"/>
      <path d="M262 258h-56a28 28 0 0 0-28 28v46" fill="none"/>
      <path d="M338 226h52a28 28 0 0 1 28 28v36" fill="none"/>
    </g>
    <g stroke="${everydayTeal}" stroke-width="9" stroke-linecap="round">
      <path d="M300 130v-40"/>
    </g>`,
  ),
  "everyday-illustration-fern": svg(
    600,
    520,
    `<g stroke="${everydayInk}" stroke-width="8" stroke-linejoin="round">
      <rect x="70" y="392" width="460" height="64" rx="18" fill="#E4B071"/>
      <path d="M300 392V132" fill="none" stroke-linecap="round"/>
      ${Array.from({ length: 5 }, (_, i) => {
        const y = 170 + i * 46;
        const w = 130 - i * 16;
        return `<path d="M300 ${y}c-${w} -16 -${w} 38 -${Math.round(w * 0.2)} 32Z" fill="#6BA96F"/><path d="M300 ${y}c${w} -16 ${w} 38 ${Math.round(w * 0.2)} 32Z" fill="#6BA96F"/>`;
      }).join("")}
    </g>
    <g stroke="${everydayTeal}" stroke-width="9" stroke-linecap="round">
      <path d="M220 300v34M380 300v34M300 340v42"/>
    </g>`,
  ),
};

// ---------------------------------------------------------------------------
// Asset table
// ---------------------------------------------------------------------------

const provenance =
  "Original artwork generated by scripts/generate-style-proof-assets.mjs for ST-094; no third-party media.";

/** @type {Array<{assetId:string,kind:"raster"|"vector",altText:string,focal:string,build:() => {bytes:Buffer,mime:string,width:number,height:number}}>} */
const assets = [];

for (const [assetId, markup] of Object.entries(vectors))
  assets.push({
    assetId,
    kind: "vector",
    focal: "center",
    altText: vectorAltText(assetId),
    build: () => {
      const dims = /viewBox="0 0 (\d+) (\d+)"/.exec(markup);
      return {
        bytes: Buffer.from(markup.replace(/\s+/g, " ").trim(), "utf8"),
        mime: "image/svg+xml",
        width: Number(dims[1]),
        height: Number(dims[2]),
      };
    },
  });

function vectorAltText(assetId) {
  const map = {
    "essential-subject-icecube": "An isolated ice cube drawn as a clear block.",
    "essential-subject-metal": "An isolated metal block with a brushed surface.",
    "essential-subject-wood": "An isolated wooden block with visible grain.",
    "essential-subject-cactus": "An isolated cactus with two arms and spines.",
    "essential-subject-fern": "An isolated fern frond with paired leaflets.",
    "essential-subject-leaf": "An isolated broad leaf showing its vein pattern.",
    "everyday-illustration-kitchen":
      "An illustrated worktop with an ice cube resting on a metal block and another on a wooden block.",
    "everyday-illustration-particles":
      "Illustrated particles in a row passing energy along from a warm end to a cool end.",
    "everyday-illustration-metal":
      "An illustrated ice cube on a metal block with a wide puddle beneath it.",
    "everyday-illustration-wood":
      "An illustrated ice cube on a wooden block with a small puddle beneath it.",
    "everyday-illustration-desert":
      "An illustrated desert scene with a cactus under a bright sun.",
    "everyday-illustration-pores":
      "An illustrated leaf with pores on its surface releasing water vapour.",
    "everyday-illustration-cactus":
      "An illustrated cactus with a thick stem and spines instead of flat leaves.",
    "everyday-illustration-fern":
      "An illustrated fern with broad flat fronds releasing water.",
  };
  return map[assetId];
}

const rasters = [
  {
    assetId: "editorial-photo-hook",
    altText:
      "An ice cube resting on a brushed metal counter under a hard side light.",
    focal: "center",
    width: 900,
    height: 600,
    make: (w, h) => metalSurfacePhoto(w, h, 0x51f3, { withIce: true, withPool: false }),
  },
  {
    assetId: "editorial-photo-evidence",
    altText:
      "A close view of meltwater pooling around an ice cube on a metal surface.",
    focal: "center",
    width: 900,
    height: 600,
    make: (w, h) => metalSurfacePhoto(w, h, 0x77a1, { withIce: true, withPool: true }),
  },
  {
    assetId: "editorial-photo-metal",
    altText: "An ice cube on a metal tray with a wide pool of meltwater.",
    focal: "center",
    width: 640,
    height: 800,
    make: (w, h) => metalSurfacePhoto(w, h, 0x2bd9, { withIce: true, withPool: true }),
  },
  {
    assetId: "editorial-photo-wood",
    altText: "An ice cube on a wooden board with almost no meltwater.",
    focal: "center",
    width: 640,
    height: 800,
    make: (w, h) => woodSurfacePhoto(w, h, 0x9c40),
  },
  {
    assetId: "editorial-photo-desert",
    altText: "A cactus standing in bright desert sun.",
    focal: "center",
    width: 900,
    height: 600,
    make: (w, h) => desertPhoto(w, h, 0x3ae2),
  },
  {
    assetId: "editorial-photo-cactus",
    altText: "A close view of a cactus stem covered in spines.",
    focal: "center",
    width: 640,
    height: 800,
    make: (w, h) => desertPhoto(w, h, 0x6b17),
  },
  {
    assetId: "editorial-photo-fern",
    altText: "A close view of broad fern fronds in damp shade.",
    focal: "center",
    width: 640,
    height: 800,
    make: (w, h) => fernPhoto(w, h, 0x1d88),
  },
  {
    assetId: "editorial-photo-landscape-wide",
    altText:
      "A wide landscape frame of a metal counter, used to test landscape crop policy.",
    focal: "center",
    width: 1120,
    height: 504,
    make: (w, h) => metalSurfacePhoto(w, h, 0x4f02, { withIce: true, withPool: true }),
  },
  {
    assetId: "editorial-photo-undersized",
    altText:
      "A deliberately low-resolution frame used to prove the minimum-resolution check.",
    focal: "center",
    width: 320,
    height: 214,
    make: (w, h) => metalSurfacePhoto(w, h, 0x8811, { withIce: true, withPool: false }),
  },
];

for (const entry of rasters)
  assets.push({
    assetId: entry.assetId,
    kind: "raster",
    focal: entry.focal,
    altText: entry.altText,
    build: () => ({
      bytes: entry.make(entry.width, entry.height).toPngBuffer(),
      mime: "image/png",
      width: entry.width,
      height: entry.height,
    }),
  });

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

const records = assets
  .map((asset) => {
    const built = asset.build();
    return {
      assetId: asset.assetId,
      altText: asset.altText,
      bytes: built.bytes.length,
      checksumSha256: createHash("sha256").update(built.bytes).digest("hex"),
      focal: asset.focal,
      height: built.height,
      kind: asset.kind,
      provenance,
      src: `data:${built.mime};base64,${built.bytes.toString("base64")}`,
      width: built.width,
    };
  })
  .sort((left, right) => left.assetId.localeCompare(right.assetId));

const header = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`scripts/generate-style-proof-assets.mjs\` (ST-094). Every asset
 * is original artwork authored for this repository; the generator is seeded and
 * reproducible, so re-running it yields byte-identical output.
 *
 * Regenerate with:
 *   pnpm --filter @avlp/scene-library run generate:style-proof-assets
 */

import type { StyleProofAsset } from "@avlp/schemas/style-proof";

export const styleProofAssetLibrary: Readonly<
  Record<string, StyleProofAsset>
> = Object.freeze({
`;

const body = records
  .map(
    (record) => `  ${JSON.stringify(record.assetId)}: Object.freeze({
    altText: ${JSON.stringify(record.altText)},
    assetId: ${JSON.stringify(record.assetId)},
    checksumSha256: ${JSON.stringify(record.checksumSha256)},
    focal: ${JSON.stringify(record.focal)},
    height: ${record.height},
    kind: ${JSON.stringify(record.kind)},
    provenance: ${JSON.stringify(record.provenance)},
    src: ${JSON.stringify(record.src)},
    width: ${record.width},
  }),
`,
  )
  .join("");

const footer = `});

/** Decoded byte length per asset, recorded in the proof manifest. */
export const styleProofAssetBytes: Readonly<Record<string, number>> =
  Object.freeze({
${records.map((record) => `  ${JSON.stringify(record.assetId)}: ${record.bytes},`).join("\n")}
});
`;

const outputPath = fileURLToPath(
  new URL("../src/style-proof/assets.generated.ts", import.meta.url),
);
writeFileSync(outputPath, header + body + footer, "utf8");

const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0);
process.stdout.write(
  `Wrote ${records.length} proof assets (${(totalBytes / 1024).toFixed(1)} KiB decoded) to ${outputPath}\n`,
);
