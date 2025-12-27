import { describe, expect, it } from 'vitest'
import { centroid, normalized1 } from './vec.ts'

describe('normalized1', () => {
  it('normalizes ', () => {
    expect(normalized1([1, 1])).toEqual([1 / 2, 1 / 2])
  })
})
describe('centroid', () => {
  it('preserves a single vector', () => {
    expect(centroid([1, 2])).toEqual([1, 2])
  })
  it('handles two', () => {
    expect(centroid([0, 10, 12], [0, 1, 2])).toEqual([0, 11 / 2, 14 / 2])
  })
  it('handles 2 dimensions', () => {
    expect(centroid([0, 1], [0, 1], [10, 10])).toEqual([10 / 3, 12 / 3])
  })
  it('handles 3 dimensions', () => {
    expect(centroid([0, 1, 2], [0, 1, 2], [10, 10, 10])).toEqual([
      10 / 3,
      12 / 3,
      14 / 3,
    ])
  })
})
