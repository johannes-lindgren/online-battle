import {
  Container,
  Graphics,
  type Renderer,
  Sprite,
  Texture,
  type FederatedPointerEvent,
  Assets,
} from 'pixi.js'
import type { GameState, PlayerInput } from './Game.tsx'
import { staticWorldConfig } from './simulation.tsx'
import { fromAngle, scale } from './math/Vector2.ts'
import { OutlineFilter } from 'pixi-filters'

const outlineFilter = new OutlineFilter(2, 0xffffff, 0.5, 0.4)
const weakOutlineFilter = new OutlineFilter(1, 0xffffff, 0.1, 0.2)

export type UnitClickEvent = {
  unitId: string
  event: FederatedPointerEvent
}

type PixiUnitRef = {
  container: Container
  sprite: Sprite
  weapon?: Graphics
}

type PixiTextures = {
  soldier: Texture
  soldierImage: Texture
}

type PixiReferences = {
  player: Map<string, PixiUnitRef>
  soldier: Map<string, PixiUnitRef>
  units: Map<string, PixiUnitRef>
  outlineFilters: Map<string, OutlineFilter>
  textures: PixiTextures
}

export const createGamePixiReferences = async (
  renderer: Renderer
): Promise<PixiReferences> => {
  return {
    player: new Map(),
    soldier: new Map(),
    units: new Map(),
    textures: await createTextures(renderer),
    outlineFilters: new Map(),
  }
}

const toPixiAngle = (radians: number): number => radians * (180 / Math.PI)

const createTextures = async (renderer: Renderer): Promise<PixiTextures> => {
  // Create white triangle texture that can be tinted
  const triangle = new Graphics()
  const triangleSize = Math.max(
    staticWorldConfig.soldier.radius,
    staticWorldConfig.unit.flagSize,
    staticWorldConfig.player.radius
  )
  triangle.poly(
    [
      // Place three vertices on the unit circle,
      //  forming a triangle with one tip to the right
      fromAngle((0 * Math.PI * 2) / 3),
      fromAngle((1 * Math.PI * 2) / 3),
      fromAngle((2 * Math.PI * 2) / 3),
    ].map((vert) => scale(vert, triangleSize))
  )
  triangle.fill(0xffffff) // White color

  const soldierTexture = renderer.extract.texture(triangle)

  const soldierImage = await Assets.load('/soldier.png')

  return {
    soldier: soldierTexture,
    soldierImage: soldierImage,
  }
}

// const getOrCreateOutlineFilter = (
//   pixiReferences: PixiReferences,
//   id: string
// ) => {
//   const existing = pixiReferences.player.get(id)
//   if (existing) {
//     return existing
//   }
//   return createOutlineFilter(pixiReferences, id)
// }
//
// const createOutlineFilter = (
//   pixiReferences: PixiReferences,
//   id: string
// ): OutlineFilter => {
//   const filter = new OutlineFilter(2, 0xffffff, 0.5, 0.4)
//   pixiReferences.outlineFilters.set(id, filter)
//   return filter
// }

const createPlayer = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
): PixiUnitRef => {
  const player = gameState.players[id]

  // Create a container to hold both the circle and text
  const container = new Container()

  // Player visual: a colored triangle
  const sprite = new Sprite(pixiReferences.textures.soldier)
  sprite.anchor.set(0.5)
  sprite.tint = player ? player.color : 'gray'
  sprite.scale =
    staticWorldConfig.player.radius /
    (pixiReferences.textures.soldier.width / 2)

  // Add both to the container
  container.addChild(sprite)
  appContainer.addChild(container)

  const result = { container: container, sprite: sprite }
  pixiReferences.player.set(id, result)
  return result
}

// Get or create graphics for a player
const getOrCreatePlayer = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
) => {
  const existing = pixiReferences.player.get(id)
  if (existing) {
    return existing
  }
  return createPlayer(appContainer, gameState, pixiReferences, id)
}
const getOrCreateUnit = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
) => {
  const existing = pixiReferences.units.get(id)
  if (existing) {
    return existing
  }
  return createUnit(appContainer, gameState, pixiReferences, id)
}
const createUnit = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
): PixiUnitRef => {
  const unit = gameState.units[id]
  const player = unit ? gameState.players[unit.playerId] : undefined

  const container = new Container()

  const sprite = new Sprite(pixiReferences.textures.soldier)
  sprite.anchor.set(0.5)
  sprite.tint = player ? player.color : 'gray'

  // Add both to the container
  container.addChild(sprite)
  appContainer.addChild(container)

  const result = { container: container, sprite: sprite }
  pixiReferences.units.set(id, result)
  return result
}

const createSoldier = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string,
  unitId: string,
  onClick: (event: UnitClickEvent) => void
): PixiUnitRef => {
  const unit = gameState.units[unitId]
  const player = unit ? gameState.players[unit.playerId] : undefined

  const container = new Container()

  const sprite = new Sprite(pixiReferences.textures.soldierImage)
  sprite.anchor.set(0.5)
  sprite.tint = player ? player.color : 'gray'

  const texture = pixiReferences.textures.soldierImage
  const imageWidth = texture.source.width
  const imageHeight = texture.source.height
  const targetSize = staticWorldConfig.soldier.radius * 2
  const scale = targetSize / Math.max(imageWidth, imageHeight)
  sprite.scale.set(scale, scale)

  const weapon = new Graphics()
  weapon
    .rect(
      staticWorldConfig.soldier.radius,
      -staticWorldConfig.soldier.weapon.width / 2,
      staticWorldConfig.soldier.weapon.length,
      staticWorldConfig.soldier.weapon.width
    )
    .fill(0xaaaaaa)

  container.addChild(sprite)
  container.addChild(weapon)
  appContainer.addChild(container)

  container.interactive = true
  container.on('pointerdown', (e) => {
    onClick({ unitId, event: e })
  })

  const result = {
    container: container,
    sprite: sprite,
    weapon: weapon,
  }
  pixiReferences.soldier.set(id, result)
  return result
}
const getOrCreateSoldier = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  soldierId: string,
  unitId: string,
  onClick: (event: UnitClickEvent) => void
) => {
  const existing = pixiReferences.soldier.get(soldierId)
  if (existing) {
    return existing
  }
  return createSoldier(
    appContainer,
    gameState,
    pixiReferences,
    soldierId,
    unitId,
    onClick
  )
}

// Render function - updates Pixi graphics from current state
export const syncToPixi = (
  appContainer: Container,
  pixiReferences: PixiReferences,
  state: GameState,
  selfId: string,
  screenDimensions: { width: number; height: number },
  onClick: (event: UnitClickEvent) => void,
  playerInput: PlayerInput
) => {
  const { selectedUnitId } = playerInput
  // Update camera position to follow own player
  const ownPlayer = state.players[selfId]
  if (ownPlayer) {
    const targetX = screenDimensions.width / 2 - ownPlayer.position.x
    const targetY = screenDimensions.height / 2 - ownPlayer.position.y
    appContainer.position.set(targetX, targetY)
  }
  // Add or update player graphics
  Object.entries(state.players).forEach(([id, player]) => {
    const ref = getOrCreatePlayer(appContainer, state, pixiReferences, id)

    ref.container.position.set(player.position.x, player.position.y)
  })

  // Add or update unit graphics
  Object.entries(state.units).forEach(([id, unit]) => {
    const ref = getOrCreateUnit(appContainer, state, pixiReferences, id)

    ref.container.position.set(unit.position.x, unit.position.y)
  })

  // Remove graphics for players that have left
  pixiReferences.player.forEach((playerRef, playerId) => {
    if (playerId in state.players) {
      return
    }
    appContainer.removeChild(playerRef.container)
    pixiReferences.player.delete(playerId)
  })

  // Add or update soldier graphics (soldiers are stored globally on state)
  Object.entries(state.soldiers).forEach(([id, soldier]) => {
    const ref = getOrCreateSoldier(
      appContainer,
      state,
      pixiReferences,
      id,
      soldier.unitId,
      onClick
    )
    ref.container.position.set(soldier.position.x, soldier.position.y)
    ref.container.angle = toPixiAngle(soldier.angle)

    // Apply highlight filter if this soldier belongs to the selected unit
    if (selectedUnitId !== undefined && soldier.unitId === selectedUnitId) {
      ref.sprite.filters = [outlineFilter]
    } else {
      ref.sprite.filters = [weakOutlineFilter]
    }
  })

  // Remove graphics for soldiers that are no longer present or whose owner left
  pixiReferences.soldier.forEach((ref, soldierId) => {
    const soldier = state.soldiers[soldierId]
    if (!soldier || !(soldier.unitId in state.units)) {
      appContainer.removeChild(ref.container)
      pixiReferences.soldier.delete(soldierId)
    }
  })
}
