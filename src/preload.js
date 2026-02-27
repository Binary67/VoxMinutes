const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recordingApi', {
  createTranscriptSession(payload) {
    return ipcRenderer.invoke('recording:create-session', payload);
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

  renameTranscriptSession(payload) {
    return ipcRenderer.invoke('recording:rename-session', payload);
  },

  deleteTranscriptSession(payload) {
    return ipcRenderer.invoke('recording:delete-session', payload);
  },

  loadTranscript(payload) {
    return ipcRenderer.invoke('recording:load-transcript', payload);
  },

  listTranscriptSessions() {
    return ipcRenderer.invoke('recording:list-sessions');
  },
});
