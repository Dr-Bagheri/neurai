/**
 * The cosmos engine.
 *
 * One WebGL2 scene, mounted once for the lifetime of the session and never torn
 * down on navigation. Routes change the *camera and the scene state*, not the
 * canvas — which is what makes moving through the site feel like one continuous
 * shot rather than a series of page loads.
 *
 * Design constraints, in priority order:
 *   1. Never block first paint. The engine is dynamically imported and starts
 *      after the page is interactive.
 *   2. All per-particle motion lives in the vertex shader. The CPU updates a
 *      handful of uniforms per frame and nothing else — no per-point JS loops.
 *   3. Glow comes from additive blending on soft point sprites, not a
 *      post-processing pass. A bloom pass would roughly double the frame cost
 *      for a difference few visitors would notice on a dark page.
 */

import * as THREE from 'three'

import { buildGalaxy, DEFAULT_GALAXY } from './galaxy'
import { buildFormations, buildGirihTorus, buildStarShell } from './girih'
import type { CosmosBudget } from './tier'

export type SceneName = 'home' | 'inner' | 'reading'

const MAX_RIPPLES = 4

/**
 * Ring tilt, in radians from face-on.
 *
 * Deliberately small. The colour ramp keys off model-space Y, so this angle is
 * also what keeps warm-at-top / cool-at-bottom aligned with the screen. Tilting
 * far enough to see the torus as a disc rotates the gradient into the depth
 * axis, where it is invisible.
 */
const RING_TILT = 0.16

/* ── Palette, mirroring the CSS design tokens ──────────────────────────────
   Kept in sync by hand with src/styles/globals.css. These are the only
   saturated colours the engine is allowed to emit — the 10% signal budget. */
// The ring poles run hotter and more saturated than the flat UI tokens.
// Additive blending against pure black desaturates everything it touches, so
// emitting the UI values directly yields the muddy brown/navy you get from
// blending — these are pre-compensated to land on the token hues on screen.
const EMBER = new THREE.Color('#ff7a3d')
const EMBER_HOT = new THREE.Color('#ffd9a8')
const LAPIS = new THREE.Color('#2f5bd0')
const CYAN = new THREE.Color('#8fe3ff')
const STAR_WARM = new THREE.Color('#f0dcc4')
const STAR_COOL = new THREE.Color('#bcd6e8')
/** Galactic core — hot white with a gold cast, the brightest thing on the page. */
const GALAXY_CORE = new THREE.Color('#fff2d6')

/** Soft radial sprite, generated at runtime so there is no image to download. */
function createSpriteTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

const NOISE_GLSL = /* glsl */ `
  // Cheap 3D value noise. Good enough for organic drift; a gradient-noise
  // implementation would cost more than the visual difference is worth here.
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
          mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
          mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`

const GIRIH_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aRingAngle;
  attribute float aTubeAngle;
  attribute vec3  aColumn;
  attribute vec3  aTerrain;

  uniform float uTime;
  uniform float uTurbulence;
  // Formation weights, summing to 1: ring / column / terrain.
  uniform vec3  uFormation;
  uniform float uJourney;
  uniform float uDisperse;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform vec3  uPointer;      // pointer, projected onto the ring plane
  uniform float uPointerForce;
  uniform vec4  uRipples[${MAX_RIPPLES}];  // xyz = origin, w = age in seconds (<0 = inactive)

  varying float vSeed;
  varying float vHeight;
  varying float vBoost;
  varying float vWisp;
  varying vec2  vRingXY;

  ${NOISE_GLSL}

  // Three octaves is the sweet spot: enough to read as turbulence rather than a
  // sine wave, cheap enough to run per-vertex on 40k points every frame.
  float fbm3(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      total += noise(p) * amplitude;
      p *= 2.07;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    // Blend the three formations. Every point has a destination in each, all
    // derived from the same (ringAngle, tubeAngle, seed) triple, so neighbours
    // stay neighbours and the morph reads as the ring *becoming* the column
    // rather than one shape fading into another.
    vec3 pos = position * uFormation.x + aColumn * uFormation.y + aTerrain * uFormation.z;

    // Turbulence follows the ring while the ring is what we are looking at, and
    // relaxes as the formation flattens — a landscape shouldn't boil.
    float turbAmount = uTurbulence * (uFormation.x + uFormation.y * 0.55 + uFormation.z * 0.3);

    // Direction from the tube's centreline outward — displacing along this
    // thickens and feathers the ring instead of just jittering points in place.
    vec3 axisPoint = normalize(vec3(pos.xy, 0.0) + 0.0001) * 3.5;
    vec3 outward = normalize(pos - axisPoint + 0.0001);

    // Points already near the tube's outer edge get displaced hardest, which is
    // what produces the wispy flame-like tendrils rather than a uniformly
    // fuzzy doughnut.
    float edge = abs(sin(aTubeAngle * 3.14159));
    vWisp = edge;

    // Turbulence advected slowly along the ring, so the plasma appears to flow
    // around the circumference rather than boil in place.
    vec3 field = vec3(pos.xy * 0.75, aRingAngle * 6.0 - uTime * 0.10);
    float turbulence = fbm3(field) - 0.5;
    float swirl = fbm3(field + vec3(11.3, 7.1, 3.7)) - 0.5;

    pos += outward * turbulence * turbAmount * (0.55 + edge * 1.45);
    // A tangential component stops the displacement reading as purely radial.
    pos += vec3(-pos.y, pos.x, 0.0) * 0.08 * swirl * turbAmount;
    pos.z += swirl * turbAmount * 0.5;

    // Dispersion: on inner routes the ring loosens into a drifting field, so
    // navigating reads as travelling outward rather than as a scene swap.
    pos += normalize(pos + 0.0001) * uDisperse * (0.6 + aSeed * 2.4);

    // Cursor gravity well. Points near the pointer are pushed outward along
    // the surface, so dragging through the ring parts it like dust.
    vec3 toPointer = pos - uPointer;
    float dist = length(toPointer);
    float influence = uPointerForce * exp(-dist * dist * 0.55);
    pos += normalize(toPointer + 0.0001) * influence * 0.85;

    // Click ripples: an expanding shell that lifts points as it passes.
    float boost = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 ripple = uRipples[i];
      if (ripple.w < 0.0) continue;
      float radius = ripple.w * 4.2;
      float d = abs(length(pos - ripple.xyz) - radius);
      float shell = smoothstep(0.85, 0.0, d) * smoothstep(2.6, 0.4, ripple.w);
      pos += normalize(pos - ripple.xyz + 0.0001) * shell * 0.5;
      boost += shell;
    }

    vSeed = aSeed;
    vHeight = pos.y;
    vRingXY = pos.xy;
    vBoost = clamp(boost, 0.0, 1.5) + influence * 1.4;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float twinkle = 0.72 + 0.28 * sin(uTime * 1.1 + aSeed * 40.0 + aRingAngle * 12.0);
    gl_PointSize = uSize * uPixelRatio * twinkle * (1.0 + vBoost * 0.9) * (14.0 / -mv.z);
  }
`

const GIRIH_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uEmber;
  uniform vec3  uEmberHot;
  uniform vec3  uLapis;
  uniform vec3  uCyan;
  uniform float uJourney;
  uniform float uOpacity;
  // Axis and extent the colour ramp is measured along. Both change with the
  // formation: the ring reads diagonally, the terrain left-to-right.
  uniform vec2  uColorAxis;
  uniform float uColorScale;

  varying float vSeed;
  varying float vHeight;
  varying float vBoost;
  varying float vWisp;
  varying vec2  vRingXY;

  void main() {
    // Soft round sprite. Discarding early is cheaper than blending a full quad.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.02, d);

    // Hue is a function of where the point sits in space, not of time, so the
    // plasma flows *through* a gradient that stays anchored. The axis rotates
    // with the formation: diagonal for the ring (ember upper-right, firouzeh
    // lower-left, giving the reference its tilt) and horizontal for the
    // terrain, where the reference runs firouzeh-left to ember-right.
    float t = clamp(dot(vRingXY, normalize(uColorAxis)) / uColorScale * 0.5 + 0.5, 0.0, 1.0);

    vec3 warm = mix(uEmber, uEmberHot, smoothstep(0.62, 1.0, t));
    vec3 cool = mix(uLapis, uCyan, smoothstep(0.42, 0.0, t));
    // A wide crossover so the flanks land on the magenta the two poles make
    // together, rather than cutting hard from warm to cool at the equator.
    vec3 color = mix(cool, warm, smoothstep(0.06, 0.94, t));

    // Scrolling cools the whole ring, continuing the ember → firouzeh journey
    // that the CSS blooms run behind the content.
    color = mix(color, uCyan, uJourney * 0.35);

    // Interaction reads as heat.
    color = mix(color, uEmberHot, clamp(vBoost * 0.5, 0.0, 0.7));

    // Wisps at the tube's outer edge are dimmer than its core, so the ring
    // reads as a dense spine fading into tendrils rather than a flat band.
    float density = mix(1.0, 0.42, vWisp);

    gl_FragColor = vec4(color, alpha * uOpacity * density * (0.34 + vSeed * 0.30));
  }
`

const STAR_VERTEX = /* glsl */ `
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uDrift;

  varying float vSeed;

  void main() {
    vec3 pos = position;
    // Barely-there drift keeps the field from reading as a printed backdrop.
    pos.x += sin(uTime * 0.05 + aSeed * 30.0) * uDrift;
    pos.y += cos(uTime * 0.04 + aSeed * 24.0) * uDrift;

    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed) + aSeed * 60.0);
    gl_PointSize = uSize * uPixelRatio * twinkle * (30.0 / -mv.z);
  }
`

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uWarm;
  uniform vec3  uCool;
  uniform float uOpacity;
  uniform float uJourney;

  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d);

    vec3 color = mix(uCool, uWarm, vSeed);
    color = mix(color, uCool, uJourney * 0.4);

    gl_FragColor = vec4(color, alpha * uOpacity * (0.35 + vSeed * 0.65));
  }
`

const GALAXY_VERTEX = /* glsl */ `
  attribute float aRadius;
  attribute float aAngle;
  attribute float aHeight;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uSpin;
  uniform float uOuterRadius;

  varying float vSeed;
  varying float vRadial;   // 0 at the core, 1 at the rim

  void main() {
    // Differential rotation: angular velocity falls with radius, so the arms
    // trail and wind over time the way a real disc does. Rotating the whole
    // mesh rigidly instead would read as a spinning picture of a galaxy.
    float angle = aAngle + uTime * uSpin / (aRadius * 0.16 + 0.6);

    vec3 pos = vec3(cos(angle) * aRadius, aHeight, sin(angle) * aRadius);

    vRadial = clamp(aRadius / uOuterRadius, 0.0, 1.0);
    vSeed = aSeed;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Core stars are larger and brighter; rim stars are dust.
    float coreBoost = 1.0 + (1.0 - vRadial) * 2.2;
    float twinkle = 0.75 + 0.25 * sin(uTime * 0.7 + aSeed * 50.0);
    gl_PointSize = uSize * uPixelRatio * coreBoost * twinkle * (26.0 / -mv.z);
  }
`

const GALAXY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uCore;
  uniform vec3  uEmber;
  uniform vec3  uLapis;
  uniform vec3  uCyan;
  uniform float uOpacity;

  varying float vSeed;
  varying float vRadial;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d);

    // Radial colour temperature, as in a real spiral: hot white-gold core,
    // ember mid-disc, cool blue outer arms where young stars sit.
    vec3 color = mix(uCore, uEmber, smoothstep(0.0, 0.34, vRadial));
    color = mix(color, uLapis, smoothstep(0.34, 0.78, vRadial));
    color = mix(color, uCyan, smoothstep(0.78, 1.0, vRadial) * 0.55);

    // Brightness falls steeply outward, which is what makes the core read as a
    // light source rather than as the middle of an evenly lit disc. The rim
    // goes almost to nothing on purpose: at this distance, faintly-lit outer
    // particles resolve as isolated specks that look like dead pixels rather
    // than like dust.
    float falloff = mix(1.0, 0.05, smoothstep(0.0, 0.68, vRadial));

    gl_FragColor = vec4(color, alpha * uOpacity * falloff * (0.5 + vSeed * 0.5));
  }
`

const NEBULA_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const NEBULA_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uJourney;
  uniform vec3  uEmber;
  uniform vec3  uLapis;
  uniform float uOpacity;

  varying vec2 vUv;

  ${NOISE_GLSL}

  float fbm(vec3 p) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      total += noise(p) * amplitude;
      p *= 2.03;
      amplitude *= 0.5;
    }
    return total;
  }

  void main() {
    vec2 uv = vUv - 0.5;
    float clouds = fbm(vec3(uv * 3.4, uTime * 0.012));

    // Two light sources, one warm and one cool, positioned at opposite corners.
    // Their relative strength swaps as the journey progresses.
    float warmLight = exp(-length(uv - vec2(0.28, 0.30)) * 3.1) * (1.0 - uJourney);
    float coolLight = exp(-length(uv + vec2(0.30, 0.26)) * 2.7) * uJourney;

    vec3 color = uEmber * warmLight + uLapis * coolLight;
    float density = smoothstep(0.35, 0.95, clouds) * (warmLight + coolLight);

    // Fade out at the edges so the plane never shows its rectangular boundary.
    float vignette = smoothstep(0.72, 0.12, length(uv));

    gl_FragColor = vec4(color, density * vignette * uOpacity);
  }
`

/**
 * Where each formation owns the scroll, and where it hands over.
 *
 * Plateaus matter as much as transitions: a formation needs a stretch where it
 * is simply itself and the reader can look at it, otherwise the page reads as
 * one continuous unresolved morph. The gaps between these ranges are the
 * cross-fades.
 */
const FORMATION_SCHEDULE = {
  ringUntil: 0.26,
  columnFrom: 0.42,
  columnUntil: 0.6,
  terrainFrom: 0.78,
} as const

/** Colour ramp axis and extent per formation, blended alongside the positions. */
const COLOR_AXIS = {
  ring: { axis: [0.42, 1] as const, scale: 4.28 },
  column: { axis: [0.15, 1] as const, scale: 7.0 },
  terrain: { axis: [1, 0.12] as const, scale: 13.0 },
} as const

const SCENE_STATE: Record<
  SceneName,
  { disperse: number; cameraZ: number; ringOpacity: number; galaxyOpacity: number }
> = {
  // Home: the ring is the subject and the galaxy is the light behind it.
  home: { disperse: 0, cameraZ: 8.7, ringOpacity: 1, galaxyOpacity: 1 },
  // Inner pages: pull back and loosen it so it reads as environment, not subject.
  inner: { disperse: 0.55, cameraZ: 11.5, ringOpacity: 0.5, galaxyOpacity: 0.42 },
  // Long-form reading: further still, and dim enough to never fight the text.
  // The galaxy dims hardest — it is the brightest object, so it is the one that
  // would cost legibility behind a column of Persian body copy.
  reading: { disperse: 1.05, cameraZ: 14.5, ringOpacity: 0.26, galaxyOpacity: 0.16 },
}

/** Frame-rate-independent easing toward a target. */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Scroll progress → the three formation weights.
 *
 * Returns weights that always sum to 1, so the vertex shader's blend is a true
 * interpolation and points never drift toward the origin mid-transition (which
 * is what happens if the weights are allowed to under-sum).
 */
function formationWeights(journey: number): [number, number, number] {
  const { ringUntil, columnFrom, columnUntil, terrainFrom } = FORMATION_SCHEDULE

  const toColumn = smoothstep(ringUntil, columnFrom, journey)
  const toTerrain = smoothstep(columnUntil, terrainFrom, journey)

  const ring = 1 - toColumn
  const column = toColumn * (1 - toTerrain)
  const terrain = toColumn * toTerrain

  return [ring, column, terrain]
}

export class CosmosEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private clock = new THREE.Clock()
  private sprite: THREE.Texture

  private ring!: THREE.Points
  private ringMaterial!: THREE.ShaderMaterial
  private starLayers: THREE.Points[] = []
  private starMaterials: THREE.ShaderMaterial[] = []
  private nebula!: THREE.Mesh
  private nebulaMaterial!: THREE.ShaderMaterial
  private galaxy!: THREE.Points
  private galaxyMaterial!: THREE.ShaderMaterial

  private budget: CosmosBudget
  private reducedMotion: boolean

  private rafId: number | null = null
  private running = false
  private visible = true

  /** Target values, eased toward every frame. */
  private targetScene: SceneName = 'home'
  private journey = 0
  private targetJourney = 0
  private pointer = new THREE.Vector2(0, 0)
  private targetPointer = new THREE.Vector2(0, 0)
  private pointerForce = 0
  private targetPointerForce = 0
  private disperse = 0
  private cameraZ = SCENE_STATE.home.cameraZ
  private ringOpacity = 1
  private galaxyOpacity = 1

  private ripples: THREE.Vector4[] = Array.from(
    { length: MAX_RIPPLES },
    () => new THREE.Vector4(0, 0, 0, -1),
  )
  private nextRipple = 0

  constructor(canvas: HTMLCanvasElement, budget: CosmosBudget, reducedMotion: boolean) {
    this.budget = budget
    this.reducedMotion = reducedMotion

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false, // points are already soft; MSAA buys nothing here
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 120)
    this.camera.position.set(0, 0, SCENE_STATE.home.cameraZ)
    this.cameraZ = SCENE_STATE.home.cameraZ

    this.sprite = createSpriteTexture()

    this.buildNebula()
    this.buildGalaxy()
    this.buildStars()
    this.buildRing()

    this.resize()
  }

  /* ── construction ─────────────────────────────────────────────────────── */

  private buildRing() {
    const { cellsU, cellsV, pointsPerSegment } = this.budget.girihCells
    const cloud = buildGirihTorus({ cellsU, cellsV, pointsPerSegment })
    const { column, terrain } = buildFormations(cloud)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(cloud.positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(cloud.seed, 1))
    geometry.setAttribute('aRingAngle', new THREE.BufferAttribute(cloud.ringAngle, 1))
    geometry.setAttribute('aTubeAngle', new THREE.BufferAttribute(cloud.tubeAngle, 1))
    geometry.setAttribute('aColumn', new THREE.BufferAttribute(column, 3))
    geometry.setAttribute('aTerrain', new THREE.BufferAttribute(terrain, 3))

    this.ringMaterial = new THREE.ShaderMaterial({
      vertexShader: GIRIH_VERTEX,
      fragmentShader: GIRIH_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uJourney: { value: 0 },
        uDisperse: { value: 0 },
        // Turbulence amplitude, in world units. This is the single knob that
        // decides whether the ring reads as crisp geometry or as living plasma.
        uTurbulence: { value: 1.35 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        // Small and dim per point. The strands are dense, so energy per point
        // must stay low or overlapping sprites additively clip to white and
        // bleach the ember/firouzeh poles out of the ring.
        uSize: { value: 2.15 },
        uPointer: { value: new THREE.Vector3(999, 999, 999) },
        uPointerForce: { value: 0 },
        uRipples: { value: this.ripples },
        uEmber: { value: EMBER },
        uEmberHot: { value: EMBER_HOT },
        uLapis: { value: LAPIS },
        uCyan: { value: CYAN },
        uOpacity: { value: 1 },
        // Starts fully on the ring; scroll rebalances toward column then terrain.
        uFormation: { value: new THREE.Vector3(1, 0, 0) },
        uColorAxis: { value: new THREE.Vector2(...COLOR_AXIS.ring.axis) },
        uColorScale: { value: COLOR_AXIS.ring.scale },
      },
    })

    this.ring = new THREE.Points(geometry, this.ringMaterial)
    // Nearly face-on, with just enough tilt to give the ring volume rather than
    // reading as a flat circle. This also keeps model-space Y aligned with
    // screen-vertical, which is what the fragment shader's colour ramp depends
    // on: tilt it toward edge-on and the ember/firouzeh split rotates into the
    // depth axis and disappears.
    this.ring.rotation.x = RING_TILT
    this.scene.add(this.ring)
  }

  private buildGalaxy() {
    const cloud = buildGalaxy({ count: this.budget.galaxyCount })

    const geometry = new THREE.BufferGeometry()
    // A dummy `position` attribute keeps three.js's frustum culling and draw
    // count happy; the real position is reconstructed from polar coordinates
    // in the vertex shader.
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cloud.count * 3), 3))
    geometry.setAttribute('aRadius', new THREE.BufferAttribute(cloud.radius, 1))
    geometry.setAttribute('aAngle', new THREE.BufferAttribute(cloud.angle, 1))
    geometry.setAttribute('aHeight', new THREE.BufferAttribute(cloud.height, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(cloud.seed, 1))
    // Culling would pop the whole disc out of view, since the dummy positions
    // put every vertex at the origin.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), DEFAULT_GALAXY.radius * 1.2)

    this.galaxyMaterial = new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERTEX,
      fragmentShader: GALAXY_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uSize: { value: 1.35 },
        uSpin: { value: 0.85 },
        uOuterRadius: { value: DEFAULT_GALAXY.radius },
        uCore: { value: GALAXY_CORE },
        uEmber: { value: EMBER },
        uLapis: { value: LAPIS },
        uCyan: { value: CYAN },
        uOpacity: { value: 1 },
      },
    })

    this.galaxy = new THREE.Points(geometry, this.galaxyMaterial)

    // Deliberately off-axis, up and to the left, spilling past the frame edge.
    //
    // Centred behind the ring it sat squarely in the ring's opening — which is
    // exactly where the hero headline goes. A bright galactic core behind
    // Persian body text destroys legibility, and two concentric round objects
    // read as a target rather than as depth. Pushed into the corner it does
    // what it should: light the scene from behind and suggest scale.
    //
    // Upper-left is also the *end* of the reading path in RTL, so it draws the
    // eye onward rather than fighting the headline for first attention.
    this.galaxy.position.set(-19, 7.5, -30)
    // Tilted enough to read as a disc in perspective, not so steep it collapses
    // to an edge-on line.
    this.galaxy.rotation.set(0.86, 0.24, 0.58)
    this.scene.add(this.galaxy)
  }

  private buildStars() {
    const radii = [46, 30, 19]

    this.budget.starCounts.forEach((count, index) => {
      if (count <= 0) return
      const shell = buildStarShell(count, radii[index] ?? 24)

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(shell.positions, 3))
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(shell.seed, 1))

      const material = new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: this.renderer.getPixelRatio() },
          uSize: { value: 1.8 + index * 0.85 },
          uDrift: { value: 0.16 * (index + 1) },
          uWarm: { value: STAR_WARM },
          uCool: { value: STAR_COOL },
          uOpacity: { value: 1.05 - index * 0.1 },
          uJourney: { value: 0 },
        },
      })

      const points = new THREE.Points(geometry, material)
      this.starLayers.push(points)
      this.starMaterials.push(material)
      this.scene.add(points)
    })
  }

  private buildNebula() {
    const geometry = new THREE.PlaneGeometry(90, 60)
    this.nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uJourney: { value: 0 },
        uEmber: { value: EMBER },
        uLapis: { value: LAPIS },
        // Raised now that the galaxy carries the composition's light. Still
        // restrained: haze inside the ring's centre is what would turn this
        // from cinematic to muddy, so the nebula lifts the corners, not the middle.
        uOpacity: { value: 0.44 },
      },
    })
    this.nebula = new THREE.Mesh(geometry, this.nebulaMaterial)
    this.nebula.position.z = -26
    this.scene.add(this.nebula)
  }

  /* ── public API ───────────────────────────────────────────────────────── */

  setScene(name: SceneName) {
    this.targetScene = name
  }

  setJourney(value: number) {
    this.targetJourney = Math.min(1, Math.max(0, value))
  }

  /** Pointer in normalised device coordinates (-1..1). */
  setPointer(x: number, y: number, active: boolean) {
    if (!this.budget.interactive) return
    this.targetPointer.set(x, y)
    this.targetPointerForce = active ? 1 : 0
  }

  /** Emit an expanding ripple from a pointer position in NDC. */
  pulse(x: number, y: number) {
    if (!this.budget.interactive || this.reducedMotion) return

    const origin = new THREE.Vector3(x, y, 0.5).unproject(this.camera)
    const slot = this.ripples[this.nextRipple % MAX_RIPPLES]!
    slot.set(origin.x, origin.y, origin.z, 0)
    this.nextRipple++
  }

  setVisible(visible: boolean) {
    this.visible = visible
  }

  resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.budget.maxPixelRatio)

    this.renderer.setPixelRatio(pixelRatio)
    this.renderer.setSize(width, height, false)

    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()

    this.ringMaterial.uniforms.uPixelRatio!.value = pixelRatio
    this.galaxyMaterial.uniforms.uPixelRatio!.value = pixelRatio
    for (const material of this.starMaterials) {
      material.uniforms.uPixelRatio!.value = pixelRatio
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.clock.start()

    if (this.reducedMotion) {
      // One frame, then stop. The universe is present but perfectly still.
      this.renderFrame(0)
      this.running = false
      return
    }

    const minFrameTime = 1 / this.budget.targetFps
    let accumulated = 0

    const loop = () => {
      this.rafId = requestAnimationFrame(loop)
      const dt = Math.min(this.clock.getDelta(), 0.05)

      if (!this.visible) return

      accumulated += dt
      if (accumulated < minFrameTime) return
      this.renderFrame(accumulated)
      accumulated = 0
    }

    this.rafId = requestAnimationFrame(loop)
  }

  stop() {
    this.running = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  dispose() {
    this.stop()
    this.scene.traverse((object) => {
      if (object instanceof THREE.Points || object instanceof THREE.Mesh) {
        object.geometry.dispose()
        const material = object.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material.dispose()
      }
    })
    this.sprite.dispose()
    this.renderer.dispose()
  }

  /* ── frame ────────────────────────────────────────────────────────────── */

  private renderFrame(dt: number) {
    const time = this.clock.getElapsedTime()
    const target = SCENE_STATE[this.targetScene]

    // Ease every driven value so scroll and route changes glide rather than cut.
    this.journey = damp(this.journey, this.targetJourney, 3.5, dt)
    this.disperse = damp(this.disperse, target.disperse, 2.2, dt)
    this.cameraZ = damp(this.cameraZ, target.cameraZ, 2.2, dt)
    this.ringOpacity = damp(this.ringOpacity, target.ringOpacity, 3, dt)
    this.galaxyOpacity = damp(this.galaxyOpacity, target.galaxyOpacity, 3, dt)
    this.pointer.x = damp(this.pointer.x, this.targetPointer.x, 6, dt)
    this.pointer.y = damp(this.pointer.y, this.targetPointer.y, 6, dt)
    this.pointerForce = damp(this.pointerForce, this.targetPointerForce, 5, dt)

    const [wRing, wColumn, wTerrain] = formationWeights(this.journey)

    // Camera: parallax from the pointer, dolly from the scene, plus a slow
    // drift so the shot is never completely locked off. As the terrain takes
    // over, the camera lifts and tips down toward it — a landscape viewed dead
    // level reads as a flat line rather than as ground receding to a horizon.
    const lookY = -2.6 * wTerrain
    this.camera.position.x = this.pointer.x * 0.85 + Math.sin(time * 0.07) * 0.14
    this.camera.position.y =
      this.pointer.y * 0.6 + Math.cos(time * 0.06) * 0.1 + wTerrain * 1.9
    this.camera.position.z = this.cameraZ
    this.camera.lookAt(0, lookY, 0)

    // Project the pointer onto the ring plane so the gravity well tracks the
    // cursor in world space rather than in screen space.
    const pointerWorld = new THREE.Vector3(this.pointer.x, this.pointer.y, 0.5).unproject(
      this.camera,
    )
    this.ringMaterial.uniforms.uPointer!.value.copy(pointerWorld)
    this.ringMaterial.uniforms.uPointerForce!.value = this.pointerForce
    this.ringMaterial.uniforms.uTime!.value = time
    this.ringMaterial.uniforms.uJourney!.value = this.journey
    this.ringMaterial.uniforms.uDisperse!.value = this.disperse
    this.ringMaterial.uniforms.uOpacity!.value = this.ringOpacity

    // ── Formation morph ──────────────────────────────────────────────────
    this.ringMaterial.uniforms.uFormation!.value.set(wRing, wColumn, wTerrain)

    // The colour ramp's axis and extent blend alongside the positions, so the
    // gradient rotates with the shape instead of snapping when it hands over.
    const axisX =
      COLOR_AXIS.ring.axis[0] * wRing +
      COLOR_AXIS.column.axis[0] * wColumn +
      COLOR_AXIS.terrain.axis[0] * wTerrain
    const axisY =
      COLOR_AXIS.ring.axis[1] * wRing +
      COLOR_AXIS.column.axis[1] * wColumn +
      COLOR_AXIS.terrain.axis[1] * wTerrain

    this.ringMaterial.uniforms.uColorAxis!.value.set(axisX, axisY)
    this.ringMaterial.uniforms.uColorScale!.value =
      COLOR_AXIS.ring.scale * wRing +
      COLOR_AXIS.column.scale * wColumn +
      COLOR_AXIS.terrain.scale * wTerrain

    // Ring rotation, slow enough to read as orbital mechanics rather than a
    // spinner. Spinning about Z carries the lattice *through* the fixed colour
    // ramp, so the pattern moves while the ember/firouzeh poles stay anchored.
    // Scaled by the ring's own weight: the terrain must not rotate, or the
    // landscape rolls sideways as it takes over.
    this.ring.rotation.z += dt * 0.035 * wRing
    this.ring.rotation.x = RING_TILT * wRing + Math.sin(time * 0.09) * 0.045 * wRing

    // Age the ripples; a negative age marks the slot free.
    for (const ripple of this.ripples) {
      if (ripple.w >= 0) {
        ripple.w += dt
        if (ripple.w > 3.2) ripple.w = -1
      }
    }

    for (const material of this.starMaterials) {
      material.uniforms.uTime!.value = time
      material.uniforms.uJourney!.value = this.journey
    }

    this.galaxyMaterial.uniforms.uTime!.value = time
    // Fades out as the scroll journey advances as well as by route: by the time
    // the terrain takes over we are conceptually somewhere else entirely.
    this.galaxyMaterial.uniforms.uOpacity!.value =
      this.galaxyOpacity * (1 - this.journey * 0.72)

    // A slow drift of the whole disc, on top of the shader's differential
    // rotation, so the galaxy never looks pinned to the viewport.
    this.galaxy.rotation.z += dt * 0.006

    this.nebulaMaterial.uniforms.uTime!.value = time
    this.nebulaMaterial.uniforms.uJourney!.value = this.journey

    // Star shells counter-rotate very slightly against the ring, which reads as
    // depth far more convincingly than parallax translation alone.
    this.starLayers.forEach((layer, index) => {
      layer.rotation.y += dt * 0.004 * (index + 1)
    })

    this.renderer.render(this.scene, this.camera)
  }
}
