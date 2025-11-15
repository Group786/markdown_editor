const { app, BrowserWindow, dialog, ipcMain, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('fs');
const started = require('electron-squirrel-startup');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Global Set to keep track of all open windows
const openWindows = new Set();
// A weak map to store the full file path associated with each BrowserWindow instance
const windowFilePaths = new WeakMap();

/**
 * Creates a new browser window and adds it to the openWindows set.
 * @returns {BrowserWindow} The newly created window instance.
 */
const createWindow = () => {
  // Create the browser window.
  const newWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
                                      // Set contextIsolation to TRUE for security when using a preload script (BEST PRACTICE)
                                      contextIsolation: true,
                                      // Node integration should be false when contextIsolation is true
                                      nodeIntegration: false,
    },
  });

  // Load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    newWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    newWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Add the window to our set for tracking
  openWindows.add(newWindow);

  // Remove the window from the set when it's closed
  newWindow.on('closed', () => {
    openWindows.delete(newWindow);
  });

  // Open the DevTools (optional for dev)
  // newWindow.webContents.openDevTools();

  return newWindow;
};

/**
 * Initializes the IPC handlers for communication with the renderer process.
 */
const initializeIpcHandlers = () => {
  // 1. Listener for opening a file. (Shows native dialog)
  ipcMain.on('open-file-dialog', (event) => {
    getFileFromUser(BrowserWindow.fromWebContents(event.sender));
  });

  // 2. Listener for saving a file when the path is NOT known (Save As...)
  ipcMain.on('save-file-request', (event, content, defaultFileName) => {
    saveFileToUser(BrowserWindow.fromWebContents(event.sender), content, defaultFileName);
  });

  // 3. Listener for saving a file when the path IS known (Direct Overwrite)
  ipcMain.on('overwrite-file-request', (event, content, fullPath) => {
    overwriteFile(BrowserWindow.fromWebContents(event.sender), content, fullPath);
  });

  // 4. Listener for opening a new window
  ipcMain.on('new-window-request', () => {
    createWindow(); // Simply call the function that creates a new BrowserWindow
  });

  // 5. Listener for updating the window title from the renderer
  ipcMain.on('update-window-title', (event, title) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      // Set the title for the specific window that sent the request
      window.setTitle(title);
    }
  });
};

/**
 * Shows the native file open dialog and reads the selected file content.
 * @param {BrowserWindow} window The window that initiated the open request.
 */
const getFileFromUser = (window) => {
  if (!window) return;

  // showOpenDialogSync blocks the main process thread until the dialog is closed.
  const files = dialog.showOpenDialogSync(window, {
    properties: ['openFile'],
    title: 'Open Markdown or Text File',
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'Markdown Files', extensions: ['md', 'markdown'] }
    ]
  });

  if (files && files.length > 0) {
    // Pass the selected file path and the target window to the openFile reader function
    openFile(window, files[0]);
  }
};

/**
 * Reads the file content asynchronously and sends the content AND the full path back to the renderer.
 * @param {BrowserWindow} window The window to send the content to.
 * @param {string} filePath The full path to the selected file.
 */
const openFile = (window, filePath) => {
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Failed to read file:', err);
      window.webContents.send('save-status', `Error loading file: ${err.message}`);
      return;
    }

    // Set the full path for this specific window
    windowFilePaths.set(window, filePath);

    // Send the content, the base file name (for display), and the FULL PATH (for saving later)
    const displayFileName = path.basename(filePath);
    window.webContents.send('file-content-ready', data, displayFileName, filePath);
  });
};

/**
 * Shows the native save dialog and writes the content to the selected path. (Save As)
 * @param {BrowserWindow} window The window that initiated the save request.
 * @param {string} content The markdown text to save.
 * @param {string} defaultFileName The suggested file name (e.g., 'Untitled.md').
 */
const saveFileToUser = (window, content, defaultFileName) => {
  if (!window) return;

  // showSaveDialogSync blocks the main process thread until the dialog is closed.
  const filePath = dialog.showSaveDialogSync(window, {
    title: 'Save Markdown File',
    defaultPath: defaultFileName,
      filters: [
        { name: 'Markdown Files', extensions: ['md', 'markdown'] },
        { name: 'Text Files', extensions: ['txt'] }
      ]
  });

  if (filePath) {
    // Write the content to the file asynchronously
    fs.writeFile(filePath, content, 'utf8', (err) => {
      if (err) {
        console.error('Failed to save file:', err);
        window.webContents.send('save-status', `Error saving file: ${err.message}`);
      } else {
        // Success: Notify renderer, sending status and the new full path
        windowFilePaths.set(window, filePath); // Update the path for the current window
        const displayFileName = path.basename(filePath);
        window.webContents.send('save-status', `File successfully saved as "${displayFileName}"`, filePath, displayFileName);
      }
    });
  } else {
    // Notify renderer that the save was cancelled
    window.webContents.send('save-status', 'Save As operation cancelled.');
  }
};

/**
 * Writes the content directly to a known file path without showing a dialog. (Overwrite)
 * @param {BrowserWindow} window The window to send the status to.
 * @param {string} content The markdown text to save.
 * @param {string} fullPath The full, known path of the file.
 */
const overwriteFile = (window, content, fullPath) => {
  if (!window) return;

  fs.writeFile(fullPath, content, 'utf8', (err) => {
    if (err) {
      console.error('Failed to overwrite file:', err);
      window.webContents.send('save-status', `Error overwriting file: ${err.message}`);
    } else {
      // Success: Notify renderer
      const displayFileName = path.basename(fullPath);
      window.webContents.send('save-status', `File successfully saved to "${displayFileName}"`);
    }
  });
};


/**
 * Sets the application menu bar based on the provided diagram structure.
 */
const setApplicationMenu = () => {
  // 1. Define the template based on the user's diagram
  const template = [
    // --- File Menu ---
    {
      label: 'File',
      submenu: [
        {
          label: 'Open File...',
          accelerator: 'CmdOrCtrl+O',
          click: (menuItem, focusedWindow) => {
            if (focusedWindow) {
              // Send an IPC signal to the focused renderer to trigger its open file logic
              focusedWindow.webContents.send('menu-open-file');
            }
          }
        },
        {
          label: 'Save File',
          accelerator: 'CmdOrCtrl+S',
          click: (menuItem, focusedWindow) => {
            if (focusedWindow) {
              // Send an IPC signal to the focused renderer to trigger its save logic
              focusedWindow.webContents.send('menu-save-file');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Export HTML',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: (menuItem, focusedWindow) => {
            if (focusedWindow) {
              // New feature: Send an IPC signal for the renderer to handle HTML export logic
              focusedWindow.webContents.send('menu-export-html');
            }
          }
        }
      ]
    },
    // --- Edit Menu (Standard roles) ---
    // This role automatically creates Undo, Redo, Cut, Copy, Paste, Select All
    { role: 'editMenu' },

    // --- Window Menu (Standard roles) ---
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },

    // --- Help Menu ---
    {
      label: 'Help',
      submenu: [
        // Search is macOS-specific
        ...(process.platform === 'darwin' ? [{ role: 'search' }] : []),
        {
          label: 'Visit Website',
          click: async () => {
            // Use the shell module to open a website externally
            await shell.openExternal('https://www.google.com');
          }
        }
      ]
    }
  ];

  // --- Application Menu (macOS only) ---
  // If the platform is macOS, unshift the application menu using built-in roles
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
                     submenu: [
                       { role: 'about' },
                       { type: 'separator' },
                       { role: 'services' },
                       { type: 'separator' },
                       { role: 'hide' },
                       { role: 'hideOthers' },
                       { role: 'unhide' },
                       { type: 'separator' },
                       { role: 'quit' }
                     ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};


// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow(); // Create the initial window
  initializeIpcHandlers(); // Initialize IPC handlers after the main window is ready
  setApplicationMenu(); // Set the application menu bar

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
