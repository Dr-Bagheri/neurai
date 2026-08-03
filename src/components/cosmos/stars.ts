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
