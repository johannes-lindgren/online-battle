import type { Unit } from './Game.tsx'
import { add, scale, sub, vector, type Vector2 } from './math/Vector2.ts'
import { staticWorldConfig } from './simulation.ts'
import { zeros } from './math/linear-algebra.ts'

export const calculateFormationSlots = (unit: Unit, position: Vector2) => {
  const { formationWidth, soldierCount } = unit
  const formationDepth = Math.ceil(formationWidth / formationWidth)
  const formationDimN = vector(formationWidth, formationDepth)
  const soldierDist = staticWorldConfig.soldier.radius * 0.5
  return zeros(soldierCount).map((_, i) => {
    const xn = i % formationWidth
    const yn = Math.floor(i / formationWidth)
    const relPos = sub(
      scale(vector(xn, yn), staticWorldConfig.soldier.radius * 2 + soldierDist),
      scale(
        formationDimN,
        0.5 * ((staticWorldConfig.soldier.radius + soldierDist) * 2)
      )
    )
    return add(position, relPos)
  })
}
