import { defineGame } from '@martini-kit/core'
import { vector } from './math/vector.ts'

type Vec2 = { x: number; y: number }

type Player = {
  position: Vec2
}

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
      players: Object.fromEntries(
        playerIds.map((id, index) => [
          id,
          {
            position: vector(100 * index, 300),
          },
        ])
      ),
      inputs: {},
    }),

    actions: {
      move: {
        apply: (state, context, input: { movingDirection: Vec2 }) => {
          if (!state.inputs) {
            state.inputs = {}
          }
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

          const allPlayerIds = [transport.thisId, ...transport.peerIds]
          allPlayerIds.forEach((peerId, index) => {
            // Manually trigger onPlayerJoin by mutating state
            if (!state.players[peerId]) {
              state.players[peerId] = {
                position: { x: index * 100, y: 300 },
              }
            }
          })
        },
      },
    },

    onPlayerJoin: (state, playerId) => {
      const playerCount = Object.keys(state.players).length
      state.players[playerId] = {
        position: { x: playerCount * 100, y: 300 },
      }
    },

    onPlayerLeave: (state, playerId) => {
      delete state.players[playerId]
    },
  })
