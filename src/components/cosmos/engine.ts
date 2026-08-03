/**
 * The cosmos engine.
 *
 * One WebGL2 scene, mounted once for the lifetime of the session and never torn
 * down on navigation. Routes move the camera; they do not rebuild the context.
 * That is what makes travelling through the site read as one continuous shot.
 *
 * The galaxy is the whole background. Scrolling flies the camera *into* it —
 * from high above the disc, down through the arms, and finally inside the
 * core. The core is not decoration: it is the assistant. Pointing at it makes
 * it brighten, and clicking it opens the chat.
 *
 * Design constraints, in priority order:
 *   1. Never block first paint. Dynamically imported, started after interactive.
 *   2. All per-particle motion lives in the vertex shader. The CPU updates a
 *      handful of uniforms per frame and nothing else.
 *   3. Glow is additive point sprites, not a post-processing pass. A bloom pass
 *      would roughly double frame cost for a difference few would notice.
 */

import * as THREE from 'three'

import { buildGalaxy, buildStarShell, DEFAULT_GALAXY, shapeWeights } from './galaxy'
import type { CosmosBudget } from './tier'

export type SceneName = 'home' | 'inner' | 'reading'

const MAX_RIPPLES = 4

/* ── Palette ───────────────────────────────────────────────────────────────
   Warm only. There is no cool pole anywhere in this scene — the discipline is
   the point, and a single blue particle would read as a bug. Values run hotter
   than the CSS tokens because additive blending against near-black desaturates
   everything it touches; these are pre-compensated to land on the token hues. */
const CORE_HOT = new THREE.Color('#fff6d8')
const STAR_YELLOW = new THREE.Color('#ffd166')
const STAR_AMBER = new THREE.Color('#ff9a3c')
const STAR_RED = new THREE.Color('#ff5e4d')
const STAR_VIOLET = new THREE.Color('#a78bfa')
const STAR_BLUE = new THREE.Color('#7ea6ff')
const STAR_ICE = new THREE.Color('#bfd4ff')

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
  return texture
}

const NOISE_GLSL = /* glsl */ `
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

const GALAXY_VERTEX = /* glsl */ `
  // Four morphologies, each (radius, angle, height).
  attribute vec3  aSpiral;
  attribute vec3  aBarred;
  attribute vec3  aElliptical;
  attribute vec3  aRing;
  attribute float aSeed;
  attribute float aKind;      // 0 bulge · 1 disc · 2 halo
  attribute float aRank;      // radial rank, stable across shapes

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uSpin;
  uniform float uOuterRadius;
  uniform float uCoreGlow;    // 0..1, pointer proximity to the core
  uniform float uJourney;
  uniform vec4  uShapes;      // weights: spiral, barred, elliptical, ring
  uniform float uDeshape;     // 0..1, peaks mid-transition — the "coming apart"
  uniform vec4  uRipples[${MAX_RIPPLES}];

  varying float vSeed;
  varying float vRadial;
  varying float vKind;
  varying float vBoost;

  ${NOISE_GLSL}

  /**
   * Reconstruct a Cartesian position from one shape's polar parameters,
   * applying differential rotation using *that shape's* radius. Rotating after
   * blending would smear the shapes together; rotating per shape keeps each
   * one turning at its own correct rate.
   */
  vec3 shapePosition(vec3 polar) {
    float angle = polar.y + uTime * uSpin / (polar.x * 0.12 + 0.8);
    return vec3(cos(angle) * polar.x, polar.z, sin(angle) * polar.x);
  }

  void main() {
    // Blend the four morphologies. Weights always sum to 1, so this is a true
    // interpolation — if they under-summed, every particle would drift toward
    // the origin mid-transition and the galaxy would collapse inward.
    vec3 pos =
        shapePosition(aSpiral)     * uShapes.x
      + shapePosition(aBarred)     * uShapes.y
      + shapePosition(aElliptical) * uShapes.z
      + shapePosition(aRing)       * uShapes.w;

    // Gentle turbulence so the dust drifts rather than sitting on rails.
    float n = noise(pos * 0.07 + vec3(0.0, uTime * 0.02, 0.0));
    pos += vec3(n - 0.5, (n - 0.5) * 0.4, n - 0.5) * 1.1;

    // "Deshape": mid-transition the structure comes apart before it reassembles.
    // Without this the morph is a clean tween between two tidy shapes, which
    // looks mechanical — real reorganisation passes through disorder.
    float scatter = noise(pos * 0.16 + vec3(uTime * 0.05, 0.0, 3.7)) - 0.5;
    pos += normalize(pos + 0.0001) * scatter * uDeshape * 16.0;
    pos.y += scatter * uDeshape * 7.0;

    // Click ripples: an expanding shell that lifts dust as it passes.
    float boost = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 ripple = uRipples[i];
      if (ripple.w < 0.0) continue;
      float shellRadius = ripple.w * 16.0;
      float d = abs(length(pos - ripple.xyz) - shellRadius);
      float shell = smoothstep(3.2, 0.0, d) * smoothstep(2.8, 0.4, ripple.w);
      pos += normalize(pos - ripple.xyz + 0.0001) * shell * 1.4;
      boost += shell;
    }

    vSeed = aSeed;
    vKind = aKind;
    // Colour keys off the *rank*, not the live radius: a particle keeps its
    // stellar colour as the galaxy reshapes, so the morph moves stars around
    // rather than repainting them.
    vRadial = clamp(aRank, 0.0, 1.0);
    vBoost = clamp(boost, 0.0, 1.5);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Core particles are larger and swell further when the pointer nears them.
    float coreness = 1.0 - smoothstep(0.0, 0.22, vRadial);
    float coreBoost = 1.0 + coreness * (2.4 + uCoreGlow * 3.0);
    float twinkle = 0.72 + 0.28 * sin(uTime * 0.8 + aSeed * 55.0);

    // -mv.z can approach zero as the camera flies through the core; clamping
    // stops point size exploding to a screen-filling white square.
    float depth = max(-mv.z, 0.9);
    gl_PointSize = uSize * uPixelRatio * coreBoost * twinkle * (1.0 + vBoost) * (30.0 / depth);
  }
`

const GALAXY_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uCore;
  uniform vec3  uYellow;
  uniform vec3  uAmber;
  uniform vec3  uRed;
  uniform vec3  uViolet;
  uniform vec3  uBlue;
  uniform float uOpacity;
  uniform float uCoreGlow;
  uniform float uJourney;

  varying float vSeed;
  varying float vRadial;
  varying float vKind;
  varying float vBoost;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.04, d);

    // The stellar ramp, read outward from the core exactly as a galaxy's
    // populations do: a hot white-yellow nucleus of old stars, cooling through
    // amber to red, then the violet of ionised nebulae, and finally the blue of
    // young stars in the outer arms.
    vec3 color = mix(uCore,   uYellow, smoothstep(0.00, 0.16, vRadial));
    color      = mix(color,   uAmber,  smoothstep(0.16, 0.34, vRadial));
    color      = mix(color,   uRed,    smoothstep(0.34, 0.52, vRadial));
    color      = mix(color,   uViolet, smoothstep(0.52, 0.74, vRadial));
    color      = mix(color,   uBlue,   smoothstep(0.74, 1.00, vRadial));

    // Pointing at the core heats the whole inner disc, not just the exact
    // centre — a light source that brightens without spilling looks like a
    // sprite swap rather than like light.
    float coreness = 1.0 - smoothstep(0.0, 0.34, vRadial);
    color = mix(color, uCore, coreness * uCoreGlow * 0.85);

    color = mix(color, uCore, clamp(vBoost * 0.5, 0.0, 0.6));

    // Brightness falls outward: that is what makes the core read as a light
    // source rather than as the middle of an evenly lit disc. Shallower than a
    // warm-only palette needed, because the blue outer arms have to stay
    // visible — they carry a third of the colour story.
    float falloff = mix(1.0, 0.16, smoothstep(0.0, 0.8, vRadial));
    // The halo is faint by nature.
    if (vKind > 1.5) falloff *= 0.4;
    falloff *= 1.0 + coreness * uCoreGlow * 1.2;

    gl_FragColor = vec4(color, alpha * uOpacity * falloff * (0.45 + vSeed * 0.55));
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
    pos.x += sin(uTime * 0.05 + aSeed * 30.0) * uDrift;
    pos.y += cos(uTime * 0.04 + aSeed * 24.0) * uDrift;

    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float twinkle = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed) + aSeed * 60.0);
    gl_PointSize = uSize * uPixelRatio * twinkle * (30.0 / max(-mv.z, 1.0));
  }
`

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uWarm;
  uniform vec3  uPale;
  uniform float uOpacity;

  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.05, d);
    vec3 color = mix(uPale, uWarm, vSeed);
    gl_FragColor = vec4(color, alpha * uOpacity * (0.3 + vSeed * 0.7));
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
  uniform vec3  uCopper;
  uniform vec3  uGold;
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
    float clouds = fbm(vec3(uv * 3.2, uTime * 0.01));

    // Two warm sources at opposite corners. Both stay warm as the journey
    // advances; the light gets closer, not cooler.
    float a = exp(-length(uv - vec2(0.26, 0.24)) * 3.0) * (0.7 + uJourney * 0.3);
    float b = exp(-length(uv + vec2(0.28, 0.22)) * 2.6) * (0.4 + uJourney * 0.6);

    vec3 color = uCopper * a + uGold * b;
    float density = smoothstep(0.35, 0.95, clouds) * (a + b);
    float vignette = smoothstep(0.72, 0.12, length(uv));

    gl_FragColor = vec4(color, density * vignette * uOpacity);
  }
`

/**
 * The camera's path from outside the galaxy to inside its core.
 *
 * `home` starts high above the disc so the spiral is legible as a shape. As the
 * journey advances the camera descends toward the disc plane and closes on the
 * core, so scrolling reads as flight rather than as zoom.
 */
/**
 * The camera barely moves.
 *
 * The galaxy is large from the first frame and never grows — scrolling changes
 * its *shape*, not its distance. A dolly would fight the morph for the
 * viewer's attention and make the size change read as the main event.
 *
 * What little movement there is exists to keep the shot alive: a slow tilt down
 * toward the disc plane so the elliptical stage reads as a volume rather than a
 * flat blob, and a small dolly to keep each morphology framed.
 */
const FLIGHT = {
  start: { y: 38, z: 46 },
  end: { y: 22, z: 54 },
} as const

/** Extra pull-back per route, so inner pages don't sit in the reader's way. */
const SCENE_STATE: Record<SceneName, { pullback: number; galaxyOpacity: number }> = {
  home: { pullback: 0, galaxyOpacity: 1 },
  inner: { pullback: 9, galaxyOpacity: 0.5 },
  // Long-form reading: the galaxy is the brightest thing on the page, so it is
  // the one that would cost legibility behind a column of Persian body copy.
  reading: { pullback: 14, galaxyOpacity: 0.24 },
}

/** Frame-rate-independent easing toward a target. */
function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** How close, in NDC, the pointer must be to the core to count as "on" it. */
const CORE_HIT_RADIUS = 0.14
/** Where proximity glow starts ramping up. */
const CORE_GLOW_RADIUS = 0.42

export class CosmosEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private clock = new THREE.Clock()
  private sprite: THREE.Texture

  private galaxy!: THREE.Points
  private galaxyMaterial!: THREE.ShaderMaterial
  private starLayers: THREE.Points[] = []
  private starMaterials: THREE.ShaderMaterial[] = []
  private nebula!: THREE.Mesh
  private nebulaMaterial!: THREE.ShaderMaterial

  private budget: CosmosBudget
  private reducedMotion: boolean

  private rafId: number | null = null
  private running = false
  private visible = true

  private targetScene: SceneName = 'home'
  private journey = 0
  private targetJourney = 0
  private pointer = new THREE.Vector2(0, 0)
  private targetPointer = new THREE.Vector2(0, 0)
  private pointerActive = false
  private galaxyOpacity = 1
  private pullback = 0
  private coreGlow = 0

  /** Core position in NDC, recomputed each frame. */
  private coreNdc = new THREE.Vector2(0, 0)
  /** 0..1 pointer proximity to the core. Read by the React layer for cursor state. */
  private coreProximity = 0

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
      antialias: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 260)
    this.camera.position.set(0, FLIGHT.start.y, FLIGHT.start.z)

    this.sprite = createSpriteTexture()

    this.buildNebula()
    this.buildGalaxy()
    this.buildStars()

    this.resize()
  }

  /* ── construction ─────────────────────────────────────────────────────── */

  private buildGalaxy() {
    const cloud = buildGalaxy({ count: this.budget.galaxyCount })

    const geometry = new THREE.BufferGeometry()
    // Dummy `position`; the real position is rebuilt from polar coordinates in
    // the vertex shader each frame.
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(cloud.count * 3), 3),
    )
    geometry.setAttribute('aSpiral', new THREE.BufferAttribute(cloud.shapes.spiral, 3))
    geometry.setAttribute('aBarred', new THREE.BufferAttribute(cloud.shapes.barred, 3))
    geometry.setAttribute('aElliptical', new THREE.BufferAttribute(cloud.shapes.elliptical, 3))
    geometry.setAttribute('aRing', new THREE.BufferAttribute(cloud.shapes.ring, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(cloud.seed, 1))
    geometry.setAttribute('aKind', new THREE.BufferAttribute(cloud.kind, 1))
    geometry.setAttribute('aRank', new THREE.BufferAttribute(cloud.rank, 1))
    // Without this, culling would pop the whole disc — every dummy vertex is at
    // the origin, so three.js computes a zero-radius bounding sphere.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), DEFAULT_GALAXY.radius * 2)

    this.galaxyMaterial = new THREE.ShaderMaterial({
      vertexShader: GALAXY_VERTEX,
      fragmentShader: GALAXY_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uSize: { value: 1.5 },
        uSpin: { value: 0.9 },
        uOuterRadius: { value: DEFAULT_GALAXY.radius },
        uCoreGlow: { value: 0 },
        uJourney: { value: 0 },
        uShapes: { value: new THREE.Vector4(1, 0, 0, 0) },
        uDeshape: { value: 0 },
        uRipples: { value: this.ripples },
        uCore: { value: CORE_HOT },
        uYellow: { value: STAR_YELLOW },
        uAmber: { value: STAR_AMBER },
        uRed: { value: STAR_RED },
        uViolet: { value: STAR_VIOLET },
        uBlue: { value: STAR_BLUE },
        uOpacity: { value: 1 },
      },
    })

    this.galaxy = new THREE.Points(geometry, this.galaxyMaterial)
    // Centred at the origin: it is the subject, and the core has to sit at
    // screen centre for the assistant interaction to make sense.
    this.galaxy.rotation.set(0, 0, 0)
    this.scene.add(this.galaxy)
  }

  private buildStars() {
    const radii = [150, 110, 80]

    this.budget.starCounts.forEach((count, index) => {
      if (count <= 0) return
      const shell = buildStarShell(count, radii[index] ?? 100)

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
          uSize: { value: 2.2 + index * 0.9 },
          uDrift: { value: 0.2 * (index + 1) },
          uWarm: { value: STAR_ICE },
          uPale: { value: STAR_YELLOW },
          uOpacity: { value: 0.9 - index * 0.1 },
        },
      })

      const points = new THREE.Points(geometry, material)
      this.starLayers.push(points)
      this.starMaterials.push(material)
      this.scene.add(points)
    })
  }

  private buildNebula() {
    const geometry = new THREE.PlaneGeometry(260, 180)
    this.nebulaMaterial = new THREE.ShaderMaterial({
      vertexShader: NEBULA_VERTEX,
      fragmentShader: NEBULA_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uJourney: { value: 0 },
        uCopper: { value: STAR_AMBER },
        uGold: { value: STAR_VIOLET },
        // Very low. The palette budget is 60% *unlit* void, and ambient haze is
        // the fastest way to spend that budget without noticing: raise this and
        // the whole frame turns brown, which is exactly what 60:30:10 forbids.
        uOpacity: { value: 0.13 },
      },
    })
    this.nebula = new THREE.Mesh(geometry, this.nebulaMaterial)
    this.nebula.position.z = -110
    this.scene.add(this.nebula)
  }

  /* ── public API ───────────────────────────────────────────────────────── */

  setScene(name: SceneName) {
    this.targetScene = name
  }

  setJourney(value: number) {
    this.targetJourney = Math.min(1, Math.max(0, value))
  }

  setPointer(x: number, y: number, active: boolean) {
    this.targetPointer.set(x, y)
    this.pointerActive = active
  }

  /** 0..1 — how close the pointer is to the galactic core. */
  getCoreProximity(): number {
    return this.coreProximity
  }

  /** True when a click at the current pointer position should open the assistant. */
  isPointerOnCore(): boolean {
    if (!this.pointerActive) return false
    return this.pointer.distanceTo(this.coreNdc) < CORE_HIT_RADIUS
  }

  /** Emit an expanding ripple through the dust from a pointer position in NDC. */
  pulse(x: number, y: number) {
    if (this.reducedMotion) return
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

    this.journey = damp(this.journey, this.targetJourney, 3, dt)
    this.galaxyOpacity = damp(this.galaxyOpacity, target.galaxyOpacity, 3, dt)
    this.pullback = damp(this.pullback, target.pullback, 2.4, dt)
    this.pointer.x = damp(this.pointer.x, this.targetPointer.x, 6, dt)
    this.pointer.y = damp(this.pointer.y, this.targetPointer.y, 6, dt)

    // ── Camera ───────────────────────────────────────────────────────────
    const t = smoothstep(0, 1, this.journey)
    const y = FLIGHT.start.y + (FLIGHT.end.y - FLIGHT.start.y) * t
    const z = FLIGHT.start.z + (FLIGHT.end.z - FLIGHT.start.z) * t

    this.camera.position.x = this.pointer.x * 1.6 + Math.sin(time * 0.06) * 0.3
    this.camera.position.y = y + this.pointer.y * 1.1 + Math.cos(time * 0.05) * 0.2
    this.camera.position.z = z + this.pullback
    this.camera.lookAt(0, 0, 0)

    // ── Core proximity ───────────────────────────────────────────────────
    // The core is the galaxy's origin. Project it to NDC and measure against
    // the pointer, so the hit target follows the core wherever the flight
    // path puts it on screen.
    const core = new THREE.Vector3(0, 0, 0).project(this.camera)
    this.coreNdc.set(core.x, core.y)

    const distance = this.pointerActive ? this.pointer.distanceTo(this.coreNdc) : Infinity
    const proximityTarget = this.pointerActive
      ? 1 - smoothstep(CORE_HIT_RADIUS, CORE_GLOW_RADIUS, distance)
      : 0
    this.coreProximity = proximityTarget
    this.coreGlow = damp(this.coreGlow, proximityTarget, 7, dt)

    // ── Morphology ───────────────────────────────────────────────────────
    const [wSpiral, wBarred, wElliptical, wRing] = shapeWeights(this.journey)
    this.galaxyMaterial.uniforms.uShapes!.value.set(wSpiral, wBarred, wElliptical, wRing)

    // "Deshape" peaks whenever no single morphology dominates — that is, in the
    // middle of a transition. Derived from the weights rather than tracked
    // separately, so it can never drift out of sync with the morph it belongs to.
    const dominant = Math.max(wSpiral, wBarred, wElliptical, wRing)
    this.galaxyMaterial.uniforms.uDeshape!.value = smoothstep(1, 0.45, dominant)

    // ── Uniforms ─────────────────────────────────────────────────────────
    this.galaxyMaterial.uniforms.uTime!.value = time
    this.galaxyMaterial.uniforms.uJourney!.value = this.journey
    this.galaxyMaterial.uniforms.uCoreGlow!.value = this.coreGlow
    this.galaxyMaterial.uniforms.uOpacity!.value = this.galaxyOpacity

    for (const ripple of this.ripples) {
      if (ripple.w >= 0) {
        ripple.w += dt
        if (ripple.w > 3.0) ripple.w = -1
      }
    }

    for (const material of this.starMaterials) {
      material.uniforms.uTime!.value = time
    }

    this.nebulaMaterial.uniforms.uTime!.value = time
    this.nebulaMaterial.uniforms.uJourney!.value = this.journey

    // Star shells counter-rotate very slightly, which reads as depth far more
    // convincingly than parallax translation alone.
    this.starLayers.forEach((layer, index) => {
      layer.rotation.y += dt * 0.003 * (index + 1)
    })

    this.renderer.render(this.scene, this.camera)
  }
}
