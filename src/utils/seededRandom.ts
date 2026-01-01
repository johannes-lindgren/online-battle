// Seeded pseudo-random integer generator based on a string seed.
// Exports:
// - seededRandomInt(seed: string, min?: number, max?: number): number
//   Returns an integer in the inclusive range [min, max]. Defaults: min=0, max=2^31-1
// Implementation notes:
// - Uses a simple hashed seed (FNV-1a) to produce a 32-bit state, then applies xorshift32 PRNG.
// - Deterministic: same seed and bounds => same output.

function fnv1aHash(str: string): number {
  let h = 0x811c9dc5 >>> 0 // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0 // FNV prime
  }
  return h >>> 0
}

function xorshift32(state: number): number {
  // state should be a non-zero 32-bit integer
  let x = state >>> 0
  x ^= (x << 13) >>> 0
  x ^= (x >>> 17) >>> 0
  x ^= (x << 5) >>> 0
  return x >>> 0
}

/**
 * Produce a pseudorandom integer deterministically from a string seed.
 *
 * @param seed - input seed string
 * @param min - inclusive minimum (default 0)
 * @param max - inclusive maximum (default 2^31-1)
 * @returns integer in [min, max]
 */
export function seededRandomInt(
  seed: string,
  min = 0,
  max = 0x7fffffff
): number {
  if (min > max) {
    throw new RangeError('min must be <= max')
  }
  // Derive initial state from seed; ensure non-zero
  let state = fnv1aHash(seed) >>> 0
  if (state === 0) state = 0xdeadbeef
  // Run the PRNG a few times to decorrelate
  state = xorshift32(state)
  state = xorshift32(state + 1)
  state = xorshift32(state + 2)
  // Now produce a 32-bit unsigned value
  const rand32 = xorshift32(state) >>> 0
  // Map to [min, max] inclusive using multiplication to avoid bias for typical ranges
  const range = (max - min) >>> 0
  if (range === 0) return min
  // Use double for multiplication to cover larger ranges safely
  const result = Math.floor((rand32 / 0x100000000) * (range + 1)) + min
  return result
}
