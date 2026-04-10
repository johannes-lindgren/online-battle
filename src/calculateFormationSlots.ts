import type { Unit } from './Game.tsx'
import { add, scale, vector, type Vector2 } from './math/Vector2.ts'
import { staticWorldConfig } from './simulation.ts'
import { zeros } from './math/linear-algebra.ts'

export const calculateFormationSlots = (unit: Unit, position: Vector2) => {
  const { formationWidth, soldierCount } = unit
  const formationDepth = Math.ceil(soldierCount / formationWidth)
  const slotSpacing = staticWorldConfig.soldier.radius * 3
  const halfWidth = ((formationWidth - 1) * slotSpacing) / 2
  const halfDepth = ((formationDepth - 1) * slotSpacing) / 2
  return zeros(soldierCount).map((_, i) => {
    const xn = i % formationWidth
    const yn = Math.floor(i / formationWidth)
    const relPos = vector(
      xn * slotSpacing - halfWidth,
      yn * slotSpacing - halfDepth
    )
    return add(position, relPos)
  })
}
