/**
 * The cosmos engine.
 *
 * One WebGL2 scene, mounted once for the lifetime of the session and never torn
 * down on navigation. Routes move the camera; they do not rebuild the context.
 *
 * Scrolling morphs the background through five formations — shell, column,
 * helix, terrain, black hole — and the camera moves to the vantage each shape
 * needs. Particles are laid out along striation lines rather than scattered,
 * which is what produces the combed, structured look rather than a dust cloud.
 *
 * Design constraints, in priority order:
 *   1. Never block first paint. Dynamically imported, started after interactive.
 *   2. All per-particle motion lives in the vertex shader. The CPU updates a
 *      handful of uniforms per frame and nothing else.
 *   3. Glow is additive point sprites, not a post-processing pass.
 */

import * as THREE from 'three'

import {
  buildFormations,
  FORMATION_CAMERA,
  FORMATION_NAMES,
  formationWeights,
} from './formations'
import { buildStarShell } from './stars'
import type { CosmosBudget } from './tier'

export type SceneName = 'home' | 'inner' | 'reading'

const MAX_RIPPLES = 4
const SHAPES = 5

/* ── Palette ───────────────────────────────────────────────────────────────
   Sampled from the reference: a cool-to-hot sweep across the object, blue and
   indigo on one flank, through violet and magenta, to red-orange on the other.
   Values run hotter than the CSS tokens because additive blending against
   black desaturates everything it touches. */
const C_BLUE = new THREE.Color('#6e8bff')
const C_INDIGO = new THREE.Color('#8b7bff')
const C_VIOLET = new THREE.Color('#b478f5')
const C_MAGENTA = new THREE.Color('#e06bb0')
const C_RED = new THREE.Color('#ff6b4a')
const C_WARM = new THREE.Color('#ff9a5a')
const STAR_PALE = new THREE.Color('#dfe4ff')

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

const PARTICLE_VERTEX = /* glsl */ `
  attribute vec3  aShell;
  attribute vec3  aColumn;
  attribute vec3  aHelix;
  attribute vec3  aTerrain;
  attribute vec3  aBlackhole;
  attribute float aU;      // striation index 0..1
  attribute float aV;      // position along the striation 0..1
  attribute float aSeed;

  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  uniform float uWeights[${SHAPES}];
  uniform float uSpin;       // scaled down for the terrain, which must not rotate
  uniform float uDeshape;    // peaks mid-transition
  uniform float uCoreGlow;
  uniform vec4  uRipples[${MAX_RIPPLES}];

  varying float vSeed;
  varying float vRamp;   // 0..1 along the colour axis
  varying float vDepth;
  varying float vBoost;

  ${NOISE_GLSL}

  void main() {
    // Blend the five formations. Weights always sum to 1, so this is a true
    // interpolation — under-summing would drag every particle toward the origin
    // mid-transition and collapse the whole structure inward.
    vec3 pos =
        aShell     * uWeights[0]
      + aColumn    * uWeights[1]
      + aHelix     * uWeights[2]
      + aTerrain   * uWeights[3]
      + aBlackhole * uWeights[4];

    // Slow rotation about the vertical. Scaled by uSpin so the terrain, which
    // would visibly roll, can be held still while the others turn.
    float a = uTime * uSpin;
    pos = vec3(pos.x * cos(a) - pos.z * sin(a), pos.y, pos.x * sin(a) + pos.z * cos(a));

    // Living surface. The reference is never still — the striations breathe
    // along their own normals rather than jittering as loose points.
    float breathe = noise(pos * 0.07 + vec3(0.0, uTime * 0.05, 0.0)) - 0.5;
    pos += normalize(pos + 0.0001) * breathe * 1.6;

    // "Deshape": mid-transition the structure comes apart before it reassembles.
    // A clean tween between two tidy shapes looks mechanical; real
    // reorganisation passes through disorder.
    float scatter = noise(pos * 0.14 + vec3(uTime * 0.06, 0.0, 4.1)) - 0.5;
    pos += normalize(pos + 0.0001) * scatter * uDeshape * 13.0;

    // Click ripples travelling through the structure.
    float boost = 0.0;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 ripple = uRipples[i];
      if (ripple.w < 0.0) continue;
      float shellR = ripple.w * 15.0;
      float d = abs(length(pos - ripple.xyz) - shellR);
      float s = smoothstep(2.8, 0.0, d) * smoothstep(2.6, 0.3, ripple.w);
      pos += normalize(pos - ripple.xyz + 0.0001) * s * 1.3;
      boost += s;
    }

    vSeed = aSeed;
    vBoost = clamp(boost, 0.0, 1.5);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    // Colour axis: diagonal across the object, matching the reference's
    // cool-lower-left to hot-upper-right sweep. Measured in *view* space so the
    // gradient stays anchored to the screen while the geometry rotates through it.
    vRamp = clamp((mv.x * 0.55 + mv.y * 0.83) / 26.0 + 0.5, 0.0, 1.0);

    float depth = max(-mv.z, 0.8);
    vDepth = depth;

    float twinkle = 0.7 + 0.3 * sin(uTime * 0.9 + aSeed * 48.0);
    gl_PointSize = uSize * uPixelRatio * twinkle * (1.0 + vBoost + uCoreGlow * 0.8) * (26.0 / depth);
  }
`

const PARTICLE_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform vec3  uBlue;
  uniform vec3  uIndigo;
  uniform vec3  uViolet;
  uniform vec3  uMagenta;
  uniform vec3  uRed;
  uniform vec3  uWarm;
  uniform float uOpacity;
  uniform float uCoreGlow;

  varying float vSeed;
  varying float vRamp;
  varying float vDepth;
  varying float vBoost;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.03, d);

    // Cool to hot across the object.
    vec3 color = mix(uBlue,  uIndigo,  smoothstep(0.00, 0.24, vRamp));
    color      = mix(color,  uViolet,  smoothstep(0.24, 0.46, vRamp));
    color      = mix(color,  uMagenta, smoothstep(0.46, 0.66, vRamp));
    color      = mix(color,  uRed,     smoothstep(0.66, 0.86, vRamp));
    color      = mix(color,  uWarm,    smoothstep(0.86, 1.00, vRamp));

    color = mix(color, vec3(1.0), clamp(vBoost * 0.5, 0.0, 0.6));

    // Distance attenuation. Near particles are brighter, which is what gives
    // the shell its luminous rim: at the silhouette you are looking along the
    // surface, so far more emitting material lies on that sight line.
    float atten = clamp(22.0 / vDepth, 0.15, 1.9);

    gl_FragColor = vec4(color, alpha * uOpacity * atten * (0.32 + vSeed * 0.5));
  }
`

const STAR_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uSize;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float twinkle = 0.5 + 0.5 * sin(uTime * (0.4 + aSeed) + aSeed * 60.0);
    gl_PointSize = uSize * uPixelRatio * twinkle * (40.0 / max(-mv.z, 1.0));
  }
`

const STAR_FRAGMENT = /* glsl */ `
  precision highp float;
  uniform vec3  uColor;
  uniform float uOpacity;
  varying float vSeed;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    gl_FragColor = vec4(uColor, smoothstep(0.5, 0.05, d) * uOpacity * (0.25 + vSeed * 0.75));
  }
`

/** Extra pull-back per route, so inner pages don't sit in the reader's way. */
const SCENE_STATE: Record<SceneName, { pullback: number; opacity: number }> = {
  home: { pullback: 0, opacity: 1 },
  inner: { pullback: 8, opacity: 0.55 },
  reading: { pullback: 13, opacity: 0.28 },
}

function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt))
}

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/** How close, in NDC, the pointer must be to the centre to open the assistant. */
const CORE_HIT_RADIUS = 0.13
const CORE_GLOW_RADIUS = 0.4

export class CosmosEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private clock = new THREE.Clock()

  private particles!: THREE.Points
  private particleMaterial!: THREE.ShaderMaterial
  private starLayers: THREE.Points[] = []
  private starMaterials: THREE.ShaderMaterial[] = []

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
  private opacity = 1
  private pullback = 0
  private coreGlow = 0

  private camY = FORMATION_CAMERA.shell.y
  private camZ = FORMATION_CAMERA.shell.z
  private camLook = FORMATION_CAMERA.shell.look

  private coreNdc = new THREE.Vector2(0, 0)
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

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400)
    this.camera.position.set(0, this.camY, this.camZ)

    this.buildStars()
    this.buildParticles()

    this.resize()
  }

  /* ── construction ─────────────────────────────────────────────────────── */

  private buildParticles() {
    const cloud = buildFormations(this.budget.formation)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(cloud.shapes.shell, 3))
    geometry.setAttribute('aShell', new THREE.BufferAttribute(cloud.shapes.shell, 3))
    geometry.setAttribute('aColumn', new THREE.BufferAttribute(cloud.shapes.column, 3))
    geometry.setAttribute('aHelix', new THREE.BufferAttribute(cloud.shapes.helix, 3))
    geometry.setAttribute('aTerrain', new THREE.BufferAttribute(cloud.shapes.terrain, 3))
    geometry.setAttribute('aBlackhole', new THREE.BufferAttribute(cloud.shapes.blackhole, 3))
    geometry.setAttribute('aU', new THREE.BufferAttribute(cloud.u, 1))
    geometry.setAttribute('aV', new THREE.BufferAttribute(cloud.v, 1))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(cloud.seed, 1))
    // Positions are rewritten in the shader, so the auto-computed sphere is
    // wrong and would cull the whole object.
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 90)

    this.particleMaterial = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.renderer.getPixelRatio() },
        uSize: { value: 1.7 },
        uWeights: { value: [1, 0, 0, 0, 0] },
        uSpin: { value: 0.05 },
        uDeshape: { value: 0 },
        uCoreGlow: { value: 0 },
        uRipples: { value: this.ripples },
        uBlue: { value: C_BLUE },
        uIndigo: { value: C_INDIGO },
        uViolet: { value: C_VIOLET },
        uMagenta: { value: C_MAGENTA },
        uRed: { value: C_RED },
        uWarm: { value: C_WARM },
        uOpacity: { value: 1 },
      },
    })

    this.particles = new THREE.Points(geometry, this.particleMaterial)
    this.scene.add(this.particles)
  }

  private buildStars() {
    const radii = [200, 140]

    this.budget.starCounts.slice(0, 2).forEach((count, index) => {
      if (count <= 0) return
      const shell = buildStarShell(count, radii[index] ?? 160)

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
          uSize: { value: 1.6 + index * 0.6 },
          uColor: { value: STAR_PALE },
          uOpacity: { value: 0.75 - index * 0.15 },
        },
      })

      const points = new THREE.Points(geometry, material)
      this.starLayers.push(points)
      this.starMaterials.push(material)
      this.scene.add(points)
    })
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

  getCoreProximity(): number {
    return this.coreProximity
  }

  isPointerOnCore(): boolean {
    if (!this.pointerActive) return false
    return this.pointer.distanceTo(this.coreNdc) < CORE_HIT_RADIUS
  }

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

    this.particleMaterial.uniforms.uPixelRatio!.value = pixelRatio
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
      if (object instanceof THREE.Points) {
        object.geometry.dispose()
        const material = object.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material.dispose()
      }
    })
    this.renderer.dispose()
  }

  /* ── frame ────────────────────────────────────────────────────────────── */

  private renderFrame(dt: number) {
    const time = this.clock.getElapsedTime()
    const target = SCENE_STATE[this.targetScene]

    this.journey = damp(this.journey, this.targetJourney, 3, dt)
    this.opacity = damp(this.opacity, target.opacity, 3, dt)
    this.pullback = damp(this.pullback, target.pullback, 2.4, dt)
    this.pointer.x = damp(this.pointer.x, this.targetPointer.x, 6, dt)
    this.pointer.y = damp(this.pointer.y, this.targetPointer.y, 6, dt)

    // ── Formation weights ────────────────────────────────────────────────
    const weights = formationWeights(this.journey)
    const uniformWeights = this.particleMaterial.uniforms.uWeights!.value as number[]
    for (let i = 0; i < SHAPES; i++) uniformWeights[i] = weights[i] ?? 0

    // Deshape peaks whenever no single formation dominates — that is, mid
    // transition. Derived from the weights rather than tracked separately, so
    // it cannot drift out of sync with the morph it belongs to.
    const dominant = Math.max(...weights)
    this.particleMaterial.uniforms.uDeshape!.value = smoothstep(1, 0.42, dominant)

    // The terrain must not rotate — a landscape that spins rolls sideways.
    const terrainWeight = weights[3] ?? 0
    this.particleMaterial.uniforms.uSpin!.value = 0.05 * (1 - terrainWeight)

    // ── Camera: blend each formation's vantage ───────────────────────────
    let y = 0
    let z = 0
    let look = 0
    FORMATION_NAMES.forEach((name, index) => {
      const w = weights[index] ?? 0
      const cam = FORMATION_CAMERA[name]
      y += cam.y * w
      z += cam.z * w
      look += cam.look * w
    })
    this.camY = damp(this.camY, y, 4, dt)
    this.camZ = damp(this.camZ, z, 4, dt)
    this.camLook = damp(this.camLook, look, 4, dt)

    this.camera.position.x = this.pointer.x * 1.4 + Math.sin(time * 0.06) * 0.25
    this.camera.position.y = this.camY + this.pointer.y * 0.9 + Math.cos(time * 0.05) * 0.2
    this.camera.position.z = this.camZ + this.pullback
    this.camera.lookAt(0, this.camLook, 0)

    // ── Core proximity ───────────────────────────────────────────────────
    const core = new THREE.Vector3(0, this.camLook, 0).project(this.camera)
    this.coreNdc.set(core.x, core.y)
    const distance = this.pointerActive ? this.pointer.distanceTo(this.coreNdc) : Infinity
    this.coreProximity = this.pointerActive
      ? 1 - smoothstep(CORE_HIT_RADIUS, CORE_GLOW_RADIUS, distance)
      : 0
    this.coreGlow = damp(this.coreGlow, this.coreProximity, 7, dt)

    // ── Uniforms ─────────────────────────────────────────────────────────
    this.particleMaterial.uniforms.uTime!.value = time
    this.particleMaterial.uniforms.uCoreGlow!.value = this.coreGlow
    this.particleMaterial.uniforms.uOpacity!.value = this.opacity

    for (const ripple of this.ripples) {
      if (ripple.w >= 0) {
        ripple.w += dt
        if (ripple.w > 2.8) ripple.w = -1
      }
    }

    for (const material of this.starMaterials) {
      material.uniforms.uTime!.value = time
    }
    this.starLayers.forEach((layer, index) => {
      layer.rotation.y += dt * 0.003 * (index + 1)
    })

    this.renderer.render(this.scene, this.camera)
  }
}
