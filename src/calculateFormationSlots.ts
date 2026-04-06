import type { Unit } from './Game.tsx'
import { add, scale, vector, type Vector2 } from './math/Vector2.ts'
import { staticWorldConfig } from './simulation.ts'
import { zeros } from './math/linear-algebra.ts'

export const calculateFormationSlots = (unit: Unit, position: Vector2) => {
  const { formationWidth, soldierCount } = unit
  const formationDepth = Math.ceil(soldierCount / formationWidth)
  const formationDimN = vector(formationWidth, formationDepth)
  const margin = staticWorldConfig.soldier.radius * 5
  const slotWidth = staticWorldConfig.soldier.radius * 2 + margin
  const formationDim = add(
    scale(formationDimN, slotWidth),
    vector(-margin, -margin)
  )
  return zeros(soldierCount).map((_, i) => {
    const xn = i % formationWidth
    const yn = Math.floor(i / formationWidth)
    const relPos = add(
      scale(vector(xn, yn), slotWidth),
      scale(formationDim, -0.5)
    )
    return add(position, relPos)
  })
}
