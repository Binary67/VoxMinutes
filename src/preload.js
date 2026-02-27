const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recordingApi', {
  createTranscriptSession() {
    return ipcRenderer.invoke('recording:create-session');
  },

  transcribeSegment(payload) {
    return ipcRenderer.invoke('recording:transcribe-segment', payload);
  },

  appendTranscript(payload) {
    return ipcRenderer.invoke('recording:append-transcript', payload);
  },

  renameSpeaker(payload) {
    return ipcRenderer.invoke('recording:rename-speaker', payload);
  },

  loadTranscript(payload) {
    return ipcRenderer.invoke('recording:load-transcript', payload);
  },
});
