const DEFAULT_RESUME_COOLDOWN_MS = 250

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function normalizeTypedText(text) {
  if (!text || typeof text !== 'string') return text

  const normalized = text.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const nonEmpty = lines.filter((line) => line.trim().length > 0)

  if (nonEmpty.length === 0) return normalized

  const indents = nonEmpty.map((line) => {
    const match = line.match(/^\s*/)
    return match ? match[0].length : 0
  })
  const minIndent = Math.min(...indents)

  if (minIndent <= 0) return normalized

  return lines
    .map((line) => line.slice(Math.min(minIndent, line.length)))
    .join('\n')
}

function pauseOrResumeTyping(state) {
  if (!state || !state.isTyping) return null

  state.isPaused = !state.isPaused
  if (state.isPaused) {
    state.resumeReadyAt = 0
    return 'typing-paused'
  }

  const resumeCooldownMs = Number.isFinite(state.resumeCooldownMs)
    ? Math.max(0, state.resumeCooldownMs)
    : DEFAULT_RESUME_COOLDOWN_MS
  state.resumeReadyAt = Date.now() + resumeCooldownMs + 80
  return 'typing-resumed'
}

function resetTypingState(state) {
  if (!state) return

  state.isTyping = false
  state.isPaused = false
  state.typingIndex = 0
  state.lineCharIndex = 0
  state.resumeReadyAt = 0
}

function getTypingUnits(text, mode) {
  if (mode === 'word') {
    return text.match(/\S+|\s+/g) || []
  }

  if (mode === 'line') {
    const lines = text.split('\n')
    return lines.map((line, index) => ({
      text: line,
      newline: index < lines.length - 1
    }))
  }

  return Array.from(text)
}

async function waitWhilePaused(state, sleepFn, getNow) {
  while (state.isTyping) {
    while (state.isPaused) {
      if (!state.isTyping) return false
      await sleepFn(50)
    }

    if (!state.isTyping) return false

    const resumeReadyAt = state.resumeReadyAt || 0
    const remaining = resumeReadyAt - getNow()
    if (remaining <= 0) {
      state.resumeReadyAt = 0
      return true
    }

    await sleepFn(Math.min(25, remaining))
  }

  return false
}

async function typeStringWithPauseChecks(text, state, sleepFn, getNow, typeChar) {
  for (const char of text) {
    if (!state.isTyping) return false

    const shouldContinue = await waitWhilePaused(state, sleepFn, getNow)
    if (!shouldContinue || !state.isTyping) return false

    await typeChar(char)
  }

  return true
}

async function typeWordToken(token, state, sleepFn, getNow, typeChar, typeChunk) {
  if (/^\s+$/.test(token)) {
    return typeStringWithPauseChecks(token, state, sleepFn, getNow, typeChar)
  }

  const shouldContinue = await waitWhilePaused(state, sleepFn, getNow)
  if (!shouldContinue || !state.isTyping) return false

  await typeChunk(token)
  return true
}

async function typeLineUnit(unit, state, sleepFn, getNow, typeChar, typeChunk) {
  const line = unit.text || ''
  const startIndex = Number.isInteger(state.lineCharIndex)
    ? Math.max(0, state.lineCharIndex)
    : 0

  if (startIndex === 0 && line.length > 0) {
    const shouldContinue = await waitWhilePaused(state, sleepFn, getNow)
    if (!shouldContinue || !state.isTyping) return false
    await typeChunk(line)
  } else {
    for (let j = startIndex; j < line.length; j++) {
      const shouldContinue = await waitWhilePaused(state, sleepFn, getNow)
      if (!shouldContinue || !state.isTyping) return false

      await typeChar(line[j])
      state.lineCharIndex = j + 1
    }
  }

  if (unit.newline) {
    const shouldContinue = await waitWhilePaused(state, sleepFn, getNow)
    if (!shouldContinue || !state.isTyping) return false
    await typeChar('\n')
  }

  state.lineCharIndex = 0
  return true
}

async function typeText(text, options = {}) {
  const {
    state,
    mode = state ? state.typingMode : 'char',
    speed = state ? state.typingSpeed : 0,
    typeChar,
    typeChunk,
    sleep: sleepFn = sleep,
    getNow = Date.now
  } = options

  if (!state) {
    throw new Error('typeText requires a state object')
  }

  if (typeof typeChar !== 'function') {
    throw new Error('typeText requires a typeChar function')
  }

  if ((mode === 'word' || mode === 'line') && typeof typeChunk !== 'function') {
    throw new Error('typeText requires a typeChunk function for word and line modes')
  }

  const normalizedText = normalizeTypedText(text)
  const units = getTypingUnits(normalizedText, mode)

  state.isTyping = true

  try {
    while (state.typingIndex < units.length) {
      if (!state.isTyping) break

      const shouldContinue = await waitWhilePaused(state, sleepFn, getNow)
      if (!shouldContinue || !state.isTyping) break

      const i = state.typingIndex
      const current = units[i]

      if (mode === 'word') {
        const completedToken = await typeWordToken(current, state, sleepFn, getNow, typeChar, typeChunk)
        if (!completedToken) break
      } else if (mode === 'line') {
        const completedLine = await typeLineUnit(current, state, sleepFn, getNow, typeChar, typeChunk)
        if (!completedLine) break
      } else {
        await typeChar(current)
      }

      state.typingIndex = i + 1
      await sleepFn(Math.max(10, speed))
    }

    if (state.typingIndex >= units.length) {
      state.typingIndex = 0
    }
  } finally {
    state.isTyping = false
    state.isPaused = false
    state.lineCharIndex = 0
    state.resumeReadyAt = 0
  }
}

module.exports = {
  normalizeTypedText,
  pauseOrResumeTyping,
  resetTypingState,
  typeText
}
