const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getConfig: () => {
    return new Promise((resolve) => {
      const listener = (event, config) => {
        ipcRenderer.off('config-data', listener)
        resolve(config)
      }
      ipcRenderer.on('config-data', listener)
      ipcRenderer.send('get-config')
    })
  },

  updateConfig: (newConfig) => {
    return new Promise((resolve, reject) => {
      let errorTimer
      const listener = (event, config) => {
        clearTimeout(errorTimer)
        ipcRenderer.off('config-updated', listener)
        resolve(config)
      }
      errorTimer = setTimeout(() => {
        ipcRenderer.off('config-updated', listener)
        reject(new Error('Config update timeout'))
      }, 5000)
      
      ipcRenderer.on('config-updated', listener)
      ipcRenderer.send('update-config', newConfig)
    })
  },

  addText: (name, text) => {
    return new Promise((resolve) => {
      const listener = (event, texts) => {
        ipcRenderer.off('text-added', listener)
        resolve(texts)
      }
      ipcRenderer.on('text-added', listener)
      ipcRenderer.send('add-text', name, text)
    })
  },

  removeText: (index) => {
    return new Promise((resolve) => {
      const listener = (event, texts) => {
        ipcRenderer.off('text-removed', listener)
        resolve(texts)
      }
      ipcRenderer.on('text-removed', listener)
      ipcRenderer.send('remove-text', index)
    })
  },

  stopTyping: () => {
    return new Promise((resolve) => {
      const listener = (event) => {
        ipcRenderer.off('typing-stopped', listener)
        resolve()
      }
      ipcRenderer.on('typing-stopped', listener)
      ipcRenderer.send('stop-typing')
    })
  },

  sendTypingKeyDown: () => {
    ipcRenderer.send('typing-key-down')
  },

  sendTypingKeyUp: () => {
    ipcRenderer.send('typing-key-up')
  },

  onTextTyped: (callback) => {
    ipcRenderer.on('text-typed', (event, data) => {
      callback(data)
    })
  },

  onTypingStopped: (callback) => {
    ipcRenderer.on('typing-stopped', () => {
      callback()
    })
  },

  onTypingPaused: (callback) => {
    ipcRenderer.on('typing-paused', () => {
      callback()
    })
  },

  onTypingResumed: (callback) => {
    ipcRenderer.on('typing-resumed', () => {
      callback()
    })
  },

  onTypingFinished: (callback) => {
    ipcRenderer.on('typing-finished', () => {
      callback()
    })
  },

  getLogs: () => {
    return ipcRenderer.invoke('get-logs')
  },

  clearLogs: () => {
    return ipcRenderer.invoke('clear-logs')
  },

  onLogEntry: (callback) => {
    ipcRenderer.on('app-log', (event, entry) => {
      callback(entry)
    })
  },

  logError: (source, message, details = '') => {
    ipcRenderer.send('app-log', {
      level: 'error',
      source,
      message,
      details
    })
  }
})

