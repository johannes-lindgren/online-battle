import { defineGame, createPlayerManager } from '@martini-kit/core'
import { vector } from './math/vector.ts'

type Vec2 = { x: number; y: number }

type Player = {
  position: Vec2
}

const playerManager = createPlayerManager<Player>({
  factory: (_playerId, index) => ({
    position: vector(index * 50, 300),
  }),
})

export interface GameState {
  players: Record<string, Player>
  inputs: Record<
    string,
    {
      movingDirection: Vec2
    }
  >
}

export const createGame = () =>
  defineGame<GameState>({
    setup: ({ playerIds }) => ({
      players: playerManager.initialize(playerIds),
      inputs: {},
    }),
    actions: {
      move: {
        apply: (state, context, input: { movingDirection: Vec2 }) => {
          // console.log('Received move input from', context.targetId, input)
          state.inputs[context.targetId] = input
        },
      },

      tick: {
        apply: (
          state,
          context,
          options: {
            nextState: GameState
            transport: {
              thisId: string
              peerIds: string[]
            }
          }
        ) => {
          if (!context.isHost) {
            // Only the host should run the game loop
            return
          }

          const { nextState, transport } = options

          // Apply the computed next state from physics simulation
          Object.assign(state, nextState)

          // const allPlayerIds = [transport.thisId, ...transport.peerIds]
          // allPlayerIds.forEach((peerId, index) => {
          //   // Manually trigger onPlayerJoin by mutating state
          //   if (!state.players[peerId]) {
          //     state.players[peerId] = {
          //       position: { x: index * 50, y: 300 },
          //     }
          //   }
          // })
        },
      },
    },
    onPlayerJoin: (state, playerId) => {
      console.log('Player joined:', playerId)
      playerManager.handleJoin(state.players, playerId)
    },

    onPlayerLeave: (state, playerId) => {
      playerManager.handleLeave(state.players, playerId)
    },
  })

// GAME SUCKING OVER