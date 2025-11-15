const { contextBridge, ipcRenderer } = require('electron');

// Define the API to be exposed to the renderer window
const api = {
    // --- Outgoing requests (Renderer -> Main) ---

    // NEW: Function to request a new window be opened
    requestNewWindow: () => ipcRenderer.send('new-window-request'),

    // Triggers the file open dialog
    openFileDialog: () => ipcRenderer.send('open-file-dialog'),

    // Triggers the 'Save As...' dialog
    saveFileRequest: (content, defaultFileName) => {
        ipcRenderer.send('save-file-request', content, defaultFileName);
    },

    // Triggers a direct overwrite to a known full path
    overwriteFileRequest: (content, fullPath) => {
        ipcRenderer.send('overwrite-file-request', content, fullPath);
    },

    // NEW: Function to send the desired window title to the main process
    updateWindowTitle: (title) => ipcRenderer.send('update-window-title', title),

    // --- Incoming listeners (Main -> Renderer) ---

    // Listener for receiving file content and path after a successful open
    onFileContentReady: (callback) => {
        ipcRenderer.on('file-content-ready', (event, content, displayFileName, fullPath) =>
        callback(event, content, displayFileName, fullPath)
        );
    },

    // Listener for receiving status messages (save success, save error, cancel)
    onSaveStatus: (callback) => {
        ipcRenderer.on('save-status', (event, status, fullPath, displayFileName) =>
        callback(event, status, fullPath, displayFileName)
        );
    },

    // NEW: Listener for the 'File > Open File...' menu click (sends no data, just triggers an action)
    onMenuOpenFile: (callback) => {
        ipcRenderer.on('menu-open-file', callback);
    },

    // NEW: Listener for the 'File > Save File' menu click (sends no data, just triggers an action)
    onMenuSaveFile: (callback) => {
        ipcRenderer.on('menu-save-file', callback);
    },

    // NEW: Listener for the 'File > Export HTML' menu click (sends no data, just triggers an action)
    onMenuExportHtml: (callback) => {
        ipcRenderer.on('menu-export-html', callback);
    },

    // --- Cleanup ---

    // Function to remove listeners on component unmount to prevent memory leaks
    removeFileListeners: () => {
        ipcRenderer.removeAllListeners('file-content-ready');
        ipcRenderer.removeAllListeners('save-status');
        // Clean up menu listeners
        ipcRenderer.removeAllListeners('menu-open-file');
        ipcRenderer.removeAllListeners('menu-save-file');
        ipcRenderer.removeAllListeners('menu-export-html');
    }
};

// Expose the API to the renderer process under the 'electronAPI' namespace
contextBridge.exposeInMainWorld('electronAPI', api);
