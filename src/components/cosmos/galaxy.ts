/**
 * کهکشان — the galaxy. It is the entire background of the site.
 *
 * Particles are stored in *polar* form (radius, angle, height) and the shader
 * reconstructs xyz every frame. That is what makes differential rotation
 * possible: real discs rotate faster near the core, so arms trail and wind.
 * Baking Cartesian positions would force rigid rotation, which reads as a
 * spinning picture of a galaxy rather than as a galaxy.
 *
 * Because the camera flies *into* this thing on scroll, the structure has to
 * survive close inspection — a background haze that looked fine at distance
 * falls apart once you are inside it. Hence three distinct populations rather
 * than one scatter: bulge, arms, and a sparse halo.
 */

export type GalaxyOptions = {
  count: number
  /** Spiral arms. Two reads as a classic barred spiral; four fills the frame better. */
  arms: number
  /** Outer radius, world units. */
  radius: number
  /** Arm winding. Higher = more revolutions from core to rim. */
  spiral: number
  /** Angular scatter away from the arm centreline. */
  scatter: number
  /** Disc thickness at the core, falling off toward the rim. */
  thickness: number
  /** Share of particles in the central bulge. */
  coreFraction: number
  /** Share of particles in the sparse outer halo. */
  haloFraction: number
}

export const DEFAULT_GALAXY: GalaxyOptions = {
  count: 34000,
  arms: 2,
  radius: 30,
  spiral: 2.15,
  scatter: 0.38,
  thickness: 2.2,
  coreFraction: 0.2,
  haloFraction: 0.12,
}

export type GalaxyCloud = {
  radius: Float32Array
  angle: Float32Array
  height: Float32Array
  seed: Float32Array
  /** 0 = bulge, 1 = arm, 2 = halo. Lets the shader treat each population differently. */
  kind: Float32Array
  count: number
}

/** Box–Muller. Uniform scatter gives arms a hard edge; normal gives real falloff. */
function gaussian(): number {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function buildGalaxy(options: Partial<GalaxyOptions> = {}): GalaxyCloud {
  const opts = { ...DEFAULT_GALAXY, ...options }
  const { count, arms, radius, spiral, scatter, thickness, coreFraction, haloFraction } = opts

  const radiusArr = new Float32Array(count)
  const angleArr = new Float32Array(count)
  const heightArr = new Float32Array(count)
  const seedArr = new Float32Array(count)
  const kindArr = new Float32Array(count)

  const coreCount = Math.floor(count * coreFraction)
  const haloCount = Math.floor(count * haloFraction)

  for (let i = 0; i < count; i++) {
    let r: number
    let theta: number
    let kind: number
    let heightScale: number

    if (i < coreCount) {
      // Bulge: dense, near-spherical, no arm structure. This is what the
      // camera ends up inside, so it needs real volume rather than a flat disc.
      kind = 0
      r = Math.pow(Math.random(), 2.4) * radius * 0.18
      theta = Math.random() * Math.PI * 2
      heightScale = 0.85
    } else if (i < coreCount + haloCount) {
      // Halo: sparse, spherical, extends past the disc. Gives the galaxy an
      // outer presence so the frame isn't empty before the fly-in starts.
      kind = 2
      r = radius * (0.55 + Math.random() * 0.75)
      theta = Math.random() * Math.PI * 2
      heightScale = 2.6
    } else {
      // Disc arms. pow > 1 concentrates toward the centre; uniform radius would
      // pile particles at the rim, since area grows with r².
      kind = 1
      r = Math.pow(Math.random(), 1.9) * radius
      const arm = Math.floor(Math.random() * arms) * ((Math.PI * 2) / arms)
      const wind = (r / radius) * spiral * Math.PI * 2
      // Scatter narrows outward so arms stay legible at the rim rather than
      // dissolving into even haze.
      theta = arm + wind + gaussian() * scatter * (1 - (r / radius) * 0.5)
      heightScale = Math.max(0.1, 1 - r / radius)
    }

    radiusArr[i] = r
    angleArr[i] = theta
    heightArr[i] = gaussian() * thickness * heightScale * 0.5
    seedArr[i] = Math.random()
    kindArr[i] = kind
  }

  return {
    radius: radiusArr,
    angle: angleArr,
    height: heightArr,
    seed: seedArr,
    kind: kindArr,
    count,
  }
}

/**
 * A spherical shell of distant stars around the camera.
 *
 * Fibonacci distribution rather than random spherical coordinates — the latter
 * clumps badly at the poles, and on a starfield that clumping is very visible.
 */
export function buildStarShell(count: number, radius: number, spread = 0.35) {
  const positions = new Float32Array(count * 3)
  const seed = new Float32Array(count)
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const theta = golden * i
    const jitter = 1 + (Math.random() - 0.5) * spread

    positions[i * 3 + 0] = Math.cos(theta) * r * radius * jitter
    positions[i * 3 + 1] = y * radius * jitter
    positions[i * 3 + 2] = Math.sin(theta) * r * radius * jitter
    seed[i] = Math.random()
  }

  return { positions, seed, count }
}
