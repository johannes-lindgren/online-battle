// TODO unsubscribe side effects

const doubleClickDelta = 250
export const keyDownTracker = () => {
  const keysDown = new Set<string>()
  let doubleClickQueue = new Set<string>()
  const clicks = new Map<
    string,
    {
      lastClicked: number
    }
  >()

  document.addEventListener('keydown', (event) => {
    if (!event.repeat) {
      keysDown.add(event.code)
    }
    const lastClick = clicks.get(event.code)?.lastClicked
    const now = performance.now()
    if (lastClick && now - lastClick < doubleClickDelta) {
      doubleClickQueue.add(event.code)
    }
    clicks.set(event.code, { lastClicked: now })
  })

  document.addEventListener('keyup', (event) => {
    keysDown.delete(event.code)
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      keysDown.clear()
    }
  })

  return {
    isKeyDown: (keyCode: KeyCode) => keysDown.has(keyCode),
    drainEventQueue: () => {
      const events = doubleClickQueue
      doubleClickQueue = new Set<string>()
      return events
    },
    destroy: () => {
      keysDown.clear()
      doubleClickQueue.clear()
      clicks.clear()
    },
  }
}

/**
 * Codes for KeyboardEvent.code
 */
export type KeyCode =
  | 'Backspace'
  | 'Tab'
  | 'Enter'
  | 'ShiftLeft'
  | 'ShiftRight'
  | 'ControlLeft'
  | 'ControlRight'
  | 'AltLeft'
  | 'AltRight'
  | 'Pause'
  | 'CapsLock'
  | 'Escape'
  | 'Space'
  | 'PageUp'
  | 'PageDown'
  | 'End'
  | 'Home'
  | 'ArrowLeft'
  | 'ArrowUp'
  | 'ArrowRight'
  | 'ArrowDown'
  | 'PrintScreen'
  | 'Insert'
  | 'Delete'
  | 'Digit0'
  | 'Digit1'
  | 'Digit2'
  | 'Digit3'
  | 'Digit4'
  | 'Digit5'
  | 'Digit6'
  | 'Digit7'
  | 'Digit8'
  | 'Digit9'
  | 'AudioVolumeMute'
  | 'AudioVolumeDown'
  | 'AudioVolumeUp'
  | 'KeyA'
  | 'KeyB'
  | 'KeyC'
  | 'KeyD'
  | 'KeyE'
  | 'KeyF'
  | 'KeyG'
  | 'KeyH'
  | 'KeyI'
  | 'KeyJ'
  | 'KeyK'
  | 'KeyL'
  | 'KeyM'
  | 'KeyN'
  | 'KeyO'
  | 'KeyP'
  | 'KeyQ'
  | 'KeyR'
  | 'KeyS'
  | 'KeyT'
  | 'KeyU'
  | 'KeyV'
  | 'KeyW'
  | 'KeyX'
  | 'KeyY'
  | 'KeyZ'
  | 'MetaLeft'
  | 'MetaRight'
  | 'ContextMenu'
  | 'Numpad0'
  | 'Numpad1'
  | 'Numpad2'
  | 'Numpad3'
  | 'Numpad4'
  | 'Numpad5'
  | 'Numpad6'
  | 'Numpad7'
  | 'Numpad8'
  | 'Numpad9'
  | 'NumpadMultiply'
  | 'NumpadAdd'
  | 'NumpadSubtract'
  | 'NumpadDecimal'
  | 'NumpadDivide'
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'NumLock'
  | 'ScrollLock'
  | 'Semicolon'
  | 'Equal'
  | 'Comma'
  | 'Minus'
  | 'Period'
  | 'Slash'
  | 'Backquote'
  | 'BracketLeft'
  | 'Backslash'
  | 'BracketRight'
  | 'Quote'
