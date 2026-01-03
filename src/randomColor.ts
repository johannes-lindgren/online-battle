// Add a simple named color palette (string -> hex) and export a type for the keys
import { seededRandomInt } from './utils/seededRandom.ts'

export const palette: Readonly<Record<string, string>> = {
  crimson: '#DC143C',
  red: '#FF0000',
  orange: '#FFA500',
  amber: '#FFBF00',
  gold: '#FFD700',
  yellow: '#FFFF00',
  lime: '#00FF00',
  chartreuse: '#7FFF00',
  green: '#008000',
  teal: '#008080',
  cyan: '#00FFFF',
  azure: '#007FFF',
  blue: '#0000FF',
  indigo: '#4B0082',
  violet: '#8F00FF',
  purple: '#800080',
  magenta: '#FF00FF',
  pink: '#FFC0CB',
  coral: '#FF7F50',
  salmon: '#FA8072',
  brown: '#A52A2A',
  sienna: '#A0522D',
} as const

export const pseudoRandomColor = (seed: string): string => {
  const entries = Object.entries(palette)
  const colorCount = entries.length
  const randomIndex = seededRandomInt(seed, 0, colorCount - 1)

  return entries[randomIndex]![1]
}
