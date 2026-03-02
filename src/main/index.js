const { app, BrowserWindow, desktopCapturer, ipcMain, session } = require('electron');
const path = require('node:path');
const {
  appendTranscript,
  createTranscriptSession,
  deleteTranscriptSession,
  generateMeetingInsights,
  listTranscriptSessions,
  loadTranscript,
  renameTranscriptSession,
  renameSpeaker,
  transcribeSegment,
} = require('../services/transcription');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 1024,
    minHeight: 680,
    autoHideMenuBar: true,
    backgroundColor: '#f3f4f7',
    webPreferences: {
      preload: path.join(__dirname, '..', 'bridge', 'preload.js'),
    },
  });

  // and load the dashboard page of the app.
  mainWindow.loadFile(path.join(__dirname, '..', 'features', 'dashboard', 'dashboard.html'));
};

let areRecordingHandlersRegistered = false;

function registerRecordingIpcHandlers() {
  if (areRecordingHandlersRegistered) {
    return;
  }

  areRecordingHandlersRegistered = true;

  ipcMain.handle('recording:create-session', async (_event, payload) =>
    createTranscriptSession(payload)
  );
  ipcMain.handle('recording:transcribe-segment', async (_event, payload) => transcribeSegment(payload));
  ipcMain.handle('recording:append-transcript', async (_event, payload) => appendTranscript(payload));
  ipcMain.handle('recording:rename-speaker', async (_event, payload) => renameSpeaker(payload));
  ipcMain.handle('recording:rename-session', async (_event, payload) =>
    renameTranscriptSession(payload)
  );
  ipcMain.handle('recording:delete-session', async (_event, payload) =>
    deleteTranscriptSession(payload)
  );
  ipcMain.handle('recording:load-transcript', async (_event, payload) => loadTranscript(payload));
  ipcMain.handle('recording:generate-meeting-insights', async (_event, payload) =>
    generateMeetingInsights(payload)
  );
  ipcMain.handle('recording:list-sessions', async () => listTranscriptSessions());
}

function configureMediaPermissions() {
  const supportedPermissions = new Set(['media', 'microphone', 'audioCapture', 'display-capture']);

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return supportedPermissions.has(permission);
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(supportedPermissions.has(permission));
  });
}

function configureDisplayMediaCapture() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        if (!sources || sources.length === 0) {
          callback({});
          return;
        }

        callback({
          video: sources[0],
          audio: 'loopback',
        });
      } catch (error) {
        console.error('Display media capture setup failed.', error);
        callback({});
      }
    },
    {
      useSystemPicker: true,
    }
  );
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  registerRecordingIpcHandlers();
  configureMediaPermissions();
  configureDisplayMediaCapture();
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
