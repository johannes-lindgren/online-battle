import { Container, Graphics, type Renderer, Sprite, Texture } from 'pixi.js'
import type { GameState } from './Game.tsx'
import { staticWorldConfig } from './simulation.tsx'

type PixiUnitRef = { container: Container; sprite: Sprite }
type PixiTextures = {
  soldier: Texture
}
type PixiReferences = {
  player: Map<string, PixiUnitRef>
  soldier: Map<string, PixiUnitRef>
  units: Map<string, PixiUnitRef>
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
  }
}
const createTextures = async (renderer: Renderer): Promise<PixiTextures> => {
  // Create white soldier texture that can be tinted
  const circle = new Graphics()
  const circleRadius = Math.max(
    staticWorldConfig.soldier.radius,
    staticWorldConfig.unit.flagSize,
    staticWorldConfig.player.radius
  )
  circle.circle(0, 0, circleRadius)
  circle.fill(0xffffff) // White color

  const soldierTexture = renderer.extract.texture(circle)

  return {
    soldier: soldierTexture,
  }
}
const createPlayer = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  id: string
): PixiUnitRef => {
  const player = gameState.players[id]

  // Create a container to hold both the circle and text
  const container = new Container()

  // Player visual: a colored square
  const sprite = new Sprite(pixiReferences.textures.soldier)
  sprite.anchor.set(0.5)
  sprite.tint = player ? player.color : 'gray'
  console.log('width')
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
  onClick: (unitId: string) => void
): PixiUnitRef => {
  const unit = gameState.units[unitId]
  const player = unit ? gameState.players[unit.playerId] : undefined

  const container = new Container()

  const sprite = new Sprite(pixiReferences.textures.soldier)
  sprite.anchor.set(0.5)
  sprite.tint = player ? player.color : 'gray'
  sprite.scale =
    staticWorldConfig.soldier.radius /
    (pixiReferences.textures.soldier.width / 2)

  container.addChild(sprite)
  appContainer.addChild(container)

  container.interactive = true
  container.on('pointerdown', () => {
    onClick(unitId)
  })

  const result = { container: container, sprite: sprite }
  pixiReferences.player.set(id, result)
  return result
}
const getOrCreateSoldier = (
  appContainer: Container,
  gameState: GameState,
  pixiReferences: PixiReferences,
  soldierId: string,
  unitId: string,
  onClick: (unitId: string) => void
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
  onClick: (unitId: string) => void
) => {
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
  })

  // Remove graphics for soldiers that are no longer present or whose owner left
  pixiReferences.soldier.forEach((ref, soldierId) => {
    const soldier = state.soldiers[soldierId]
    if (!soldier || !(soldier.unitId in state.players)) {
      appContainer.removeChild(ref.container)
      pixiReferences.soldier.delete(soldierId)
    }
  })
}
