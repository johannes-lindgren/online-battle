export type Vector = {
  x: number
  y: number
}

export const vector = (x: number, y: number): Vector => ({
  x,
  y,
})

// Constants
export const origo: Vector = { x: 0, y: 0 }
export const left: Vector = { x: -1, y: 0 }
export const right: Vector = { x: 1, y: 0 }
export const up: Vector = { x: 0, y: 1 }
export const down: Vector = { x: 0, y: -1 }

// Basic arithmetic operations
export const add = (...vecs: Vector[]): Vector => {
  let x = 0
  let y = 0
  for (const v of vecs) {
    x += v.x
    y += v.y
  }
  return { x, y }
}

export const sum = (v1: Vector, v2: Vector): Vector =>
  vector(v1.x + v2.x, v1.y + v2.y)

export const sub = (v1: Vector, v2: Vector): Vector =>
  vector(v1.x - v2.x, v1.y - v2.y)

export const diff = (v1: Vector, v2: Vector): Vector =>
  vector(v1.x - v2.x, v1.y - v2.y)

export const neg = (v: Vector): Vector => vector(-v.x, -v.y)

export const scale = (v: Vector, scalar: number): Vector =>
  vector(v.x * scalar, v.y * scalar)

export const div = (v: Vector, denominator: number): Vector =>
  vector(v.x / denominator, v.y / denominator)

// Centroid (average of multiple vectors)
export const centroid = (...vecs: Vector[]): Vector => {
  const sum = add(...vecs)
  return div(sum, vecs.length)
}

// Norms and distances
export const norm1 = (v: Vector): number => Math.abs(v.x) + Math.abs(v.y)

export const norm2 = (v: Vector): number => Math.sqrt(v.x * v.x + v.y * v.y)

export const lengthSquared = (v: Vector): number => v.x * v.x + v.y * v.y

export const length = norm2

export const distSquared = (v1: Vector, v2: Vector): number => {
  const dx = v2.x - v1.x
  const dy = v2.y - v1.y
  return dx * dx + dy * dy
}

export const dist = (v1: Vector, v2: Vector): number =>
  Math.sqrt(distSquared(v1, v2))

// Normalization
export const normalized1 = (v: Vector): Vector => {
  const n = norm1(v)
  if (n === 0) return origo
  return div(v, n)
}

export const normalized2 = (v: Vector): Vector | undefined => {
  const len = norm2(v)
  if (len === 0) return undefined
  return div(v, len)
}

export const normalized = normalized2

export const normalize = (v: Vector): Vector => {
  const len = norm2(v)
  if (len === 0) return origo
  return div(v, len)
}

// Dot and cross products
export const dot = (v1: Vector, v2: Vector): number => v1.x * v2.x + v1.y * v2.y

export const cross = (v1: Vector, v2: Vector): number =>
  v1.x * v2.y - v1.y * v2.x

export const project = (v: Vector, axis: Vector): Vector =>
  scale(axis, dot(v, axis))

// Rotation and angles
export const angle = (v: Vector): number => Math.atan2(v.y, v.x)

export const fromAngle = (angle: number): Vector =>
  vector(Math.cos(angle), Math.sin(angle))

export const radians = (degrees: number): number => (degrees * Math.PI) / 180

export const degrees = (radians: number): number => (radians * 180) / Math.PI

export const antiClockwise90deg = (v: Vector): Vector => vector(-v.y, v.x)

export const clockwise90deg = (v: Vector): Vector => vector(v.y, -v.x)

export const rotate = (v: Vector, angleRad: number): Vector => {
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return vector(v.x * cos - v.y * sin, v.x * sin + v.y * cos)
}

export const rotateAround = (
  v: Vector,
  center: Vector,
  angleRad: number
): Vector => {
  const offset = sub(v, center)
  const rotated = rotate(offset, angleRad)
  return add(center, rotated)
}

// Interpolation
export const lerp = (v1: Vector, v2: Vector, t: number): Vector =>
  vector(v1.x + (v2.x - v1.x) * t, v1.y + (v2.y - v1.y) * t)

// Clamping
export const clamp = (v: Vector, min: number, max: number): Vector =>
  vector(Math.max(min, Math.min(max, v.x)), Math.max(min, Math.min(max, v.y)))

export const clampLength = (v: Vector, maxLength: number): Vector => {
  const len = norm2(v)
  if (len > maxLength) {
    return scale(v, maxLength / len)
  }
  return v
}

// Utility functions
export const equals = (v1: Vector, v2: Vector, epsilon = 0.0001): boolean => {
  return Math.abs(v1.x - v2.x) < epsilon && Math.abs(v1.y - v2.y) < epsilon
}

export const isZero = (v: Vector, epsilon = 0.0001): boolean =>
  Math.abs(v.x) < epsilon && Math.abs(v.y) < epsilon

export const perpendicular = antiClockwise90deg

export const reflect = (v: Vector, normal: Vector): Vector => {
  const d = 2 * dot(v, normal)
  return sub(v, scale(normal, d))
}
