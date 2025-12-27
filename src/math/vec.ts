import { zeros } from './linear-algebra.ts'

export type Tuple2<T> = [T, T]
export type Tuple3<T> = [T, T, T]
export type Tuple4<T> = [T, T, T, T]
export type Vec = number[]
export type Vec2 = Tuple2<number>
export type Vec3 = Tuple3<number>
export type Vec4 = Tuple4<number>

export type VecXy = {
  x: number
  y: number
}
export type VecXyz = {
  x: number
  y: number
  z: number
}

export const vec2 = (v: VecXy): Vec2 => [v.x, v.y]
export const vec3 = (v: VecXyz): Vec3 => [v.x, v.y, v.z]

export const vecXy = (v: Vec2): VecXy => ({
  x: v[0],
  y: v[1],
})
export const vecXyz = (v: Vec3): VecXyz => ({
  x: v[0],
  y: v[1],
  z: v[2],
})

export const add = <V extends Vec>(...vecs: V[]): V => {
  const dimensions = vecs[0].length
  let s = zeros(dimensions) as V
  for (let v of vecs) {
    for (let dimension = 0; dimension < dimensions; dimension++) {
      s[dimension] += v[dimension]
    }
  }
  return s
}
export const sub = (v1: Vec2, v2: Vec2): Vec2 => [v1[0] - v2[0], v1[1] - v2[1]]

export const origo: Vec2 = [0, 0]
export const left: Vec2 = [-1, 0]
export const right: Vec2 = [1, 0]
export const up: Vec2 = [0, 1]
export const down: Vec2 = [0, -1]

export const neg = <T extends Vec>(vec: T): T => {
  let out = new Array(vec.length)
  for (let i = 0; i < vec.length; i++) {
    out[i] = -vec[i]
  }
  return out as T
}

export const scale = <T extends Vec>(vec: T, scalar: number): T => {
  let out = new Array(vec.length)
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] * scalar
  }
  return out as T
}

export const div = <T extends Vec>(vec: T, denominator: number): T => {
  let out = new Array(vec.length)
  for (let i = 0; i < vec.length; i++) {
    out[i] = vec[i] / denominator
  }
  return out as T
}

export const centroid = <V extends Vec>(...vecs: V[]): V => {
  const dimensions = vecs[0].length
  const c = add(...vecs)
  for (let dimension = 0; dimension < dimensions; dimension++) {
    c[dimension] /= vecs.length
  }
  return c
}

export const sum = (v: Vec) => {
  let acc = 0
  for (let x of v) {
    acc += x
  }
  return acc
}

/**
 * The L1 norm, Manhattan norm
 * @param v
 */
export const norm1 = (v: Vec): number => {
  let acc = 0
  for (let x of v) {
    acc += Math.abs(x)
  }
  return acc
}

export const dot = <V extends Vec>(v1: V, v2: V): number => {
  let acc = 0
  for (let i = 0; i < v1.length; i++) {
    acc += v1[i] * v2[i]
  }
  return acc
}

export const project = (v: Vec2, axis: Vec2): Vec2 => scale(axis, dot(v, axis))

export const norm2 = (v: Vec): number => {
  let acc = 0
  for (let x of v) {
    acc += x * x
  }
  return Math.sqrt(acc)
}

export const distSquared = (v1: Vec2, v2: Vec2): number => {
  const diff = sub(v1, v2)
  return dot(diff, diff)
}

/**
 * The vector normalized according to the L1 norm (Manhattan norm)
 * @param v
 */
export const normalized1 = (v: Vec): Vec => v.map((it) => it / norm1(v))
export const normalized2 = <V extends Vec>(v: V): V | undefined => {
  const len = norm2(v)
  if (len === 0) {
    return undefined
  }
  return v.map((it) => it / len) as V
}
/*
 * Rotation
 */
export const angle = (vec: Vec2): number => Math.atan2(vec[1], vec[0])
export const fromAngle = (angle: number): Vec2 => [
  Math.cos(angle),
  Math.sin(angle),
]
export const radians = (degrees: number): number => (degrees * Math.PI) / 180
export const degrees = (radians: number): number => (radians * 180) / Math.PI
export const antiClockWise90deg = (vec: Vec2): Vec2 => [-vec[1], vec[0]]
export const clockwise90deg = (vec: Vec2): Vec2 => [vec[1], -vec[0]]
