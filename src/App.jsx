import { useEffect, useState, useCallback } from "react";
import { marked } from 'marked';
// We assume Button and Input components exist or are stubbed within this single file.

// Stub Components: Merged for the single-file mandate.
const Button = ({ children, onClick, className, disabled = false }) => (
    <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 font-semibold text-sm rounded-lg shadow-md transition-all
        ${className}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg hover:brightness-110'}`}
        >
        {children}
        </button>
);
// Input is not strictly necessary but kept for completeness
const Input = ({ onChange, value, placeholder, className }) => (
    <input
    onChange={onChange}
    value={value}
    placeholder={placeholder}
    className={`border p-2 rounded-lg w-full ${className}`}
    />
);

// Access the API exposed by preload.js
// TypeScript guard would be needed in a real app, but for now, we assume it exists.
const api = window.electronAPI;

const App = () => {
    // Setting initial default content to ensure the screen is not blank on load
    const defaultMarkdown =
    `# Welcome to the Secure Markdown Editor
    ---
    This is an **Electron + React** app using a secure IPC bridge.

    ### Multi-Window Ready!
    * Click '➕ New Window' below or use the Window menu to open another isolated editor.
    * File operations (Open/Save) are now completely separate for each window.

    \`\`\`javascript
    // Example code block
    const greet = (name) => {
        return \`Hello, \${name}!\`;
    };
    \`\`\`
    `;

    // State for the editor content and its parsed HTML
    const [markedText, setMarkedText] = useState(defaultMarkdown);
    const [htmlMarkup, setHtmlMarkup] = useState("");

    // State for file tracking:
    // fileName: The full, absolute path of the currently open file (or null for new files).
    const [fileName, setFileName] = useState(null);
    // displayFileName: The name shown to the user (e.g., 'MyFile.md' or 'Untitled.md').
    const [displayFileName, setDisplayFileName] = useState("Untitled.md");

    // State for showing temporary status messages
    const [saveStatus, setSaveStatus] = useState(null);

    // --- IPC Outgoing Functions (Requesting Main Process actions) ---

    // 1. Function to request the file dialog from the main process (Open)
    const openFileDialog = useCallback(() => {
        setSaveStatus("Opening file dialog...");
        // Sends request via the exposed API
        api.openFileDialog();
    }, []);

    // 2. Function to handle saving (chooses between Save/Overwrite or Save As)
    const saveFileDialog = useCallback(() => {
        setSaveStatus("Saving...");

        if (fileName) {
            // Case 1: File is already open (known path) -> Overwrite directly
            api.overwriteFileRequest(markedText, fileName);
        } else {
            // Case 2: New/Untitled file (path unknown) -> Show Save As dialog
            api.saveFileRequest(markedText, displayFileName);
        }
    }, [markedText, fileName, displayFileName]);

    // 2.5. NEW: Function to handle HTML Export (Save As HTML)
    const exportHtmlDialog = useCallback(() => {
        setSaveStatus("Exporting HTML...");
        // Generate a default file name based on the current display name, replacing .md/.markdown with .html
        const defaultExportName = displayFileName.replace(/\.(md|markdown)$/i, '') + '.html';

        // Use the existing save file request mechanism, passing the fully rendered HTML content
        api.saveFileRequest(htmlMarkup, defaultExportName);
    }, [htmlMarkup, displayFileName]);

    // 3. NEW: Function to request a new, separate window
    const handleNewWindow = useCallback(() => {
        setSaveStatus("Opening new editor window...");
        // Sends request via the exposed API
        api.requestNewWindow();
    }, []);


    // --- IPC Incoming Listeners (Receiving responses from Main Process) ---

    useEffect(() => {
        // Handler for receiving opened file content and path
        const handleFileContent = (event, content, receivedDisplayFileName, fullPath) => {
            console.log("File content received:", fullPath);
            setMarkedText(content);
            setFileName(fullPath); // Store the full path for direct saving
            setDisplayFileName(receivedDisplayFileName); // Store the base name for display
            setSaveStatus(`File "${receivedDisplayFileName}" loaded.`);
        };

        // Handler for receiving save status updates
        const handleSaveStatus = (event, status, receivedFullPath, receivedDisplayFileName) => {
            setSaveStatus(status);

            // If the save was a "Save As" operation, we receive a new fullPath and display name
            // We need to update our state to reflect the new file location for subsequent saves.
            if (receivedFullPath) {
                setFileName(receivedFullPath);
                setDisplayFileName(receivedDisplayFileName);
            }
        };

        // Define menu handlers using existing useCallback functions
        const handleMenuOpen = () => openFileDialog();
        const handleMenuSave = () => saveFileDialog();
        const handleMenuExport = () => exportHtmlDialog();


        // Attach standard IPC listeners
        api.onFileContentReady(handleFileContent);
        api.onSaveStatus(handleSaveStatus);

        // Attach menu listeners (triggered by the Electron Menu Bar)
        api.onMenuOpenFile(handleMenuOpen);
        api.onMenuSaveFile(handleMenuSave);
        api.onMenuExportHtml(handleMenuExport);


        // Cleanup: remove listeners when the component unmounts
        return () => {
            api.removeFileListeners();
        };
    }, [openFileDialog, saveFileDialog, exportHtmlDialog]); // Added dependencies for the menu handlers

    // --- NEW EFFECT: Update the Window Title ---
    useEffect(() => {
        // We ensure the API exists before calling it
        if (api && api.updateWindowTitle) {
            // Construct the desired title string
            const fullTitle = `${displayFileName} - Markdown Editor`;
            // Send the title back to the main process for the specific window
            api.updateWindowTitle(fullTitle);
        }
    }, [displayFileName]);


    // --- Local Effects & Handlers ---

    // Effect to update HTML preview whenever markedText changes
    useEffect(() => {
        // marked.parse is synchronous and safe to run directly
        const parsedHtml = marked.parse(markedText);
        setHtmlMarkup(parsedHtml);
    }, [markedText]);

    const clearEditor = useCallback(() => {
        setMarkedText(defaultMarkdown);
        setFileName(null);
        setDisplayFileName("Untitled.md");
        setSaveStatus("Editor reset.");
    }, [defaultMarkdown]);

    // Helper for showing status for a short duration
    useEffect(() => {
        if (saveStatus) {
            // Clear the status message after 3 seconds
            const timer = setTimeout(() => {
                setSaveStatus(null);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [saveStatus]);

    // Tailwind Classes for Status Bar (Color-coding based on status)
    const statusClass = saveStatus && saveStatus.includes('Error')
    ? 'bg-red-100 text-red-800 border-red-300'
    : saveStatus && saveStatus.includes('successfully saved')
    ? 'bg-green-100 text-green-800 border-green-300'
    : 'bg-blue-100 text-blue-800 border-blue-300';

    const isSaving = saveStatus && saveStatus.includes('Saving...');

    return (
        <div className="min-h-screen bg-gray-50 p-4 font-sans flex flex-col items-center">
        {/* Status Notification */}
        {saveStatus && (
            <div className={`fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full shadow-xl transition-opacity duration-300 ${statusClass} border z-50`}>
            <p className="text-sm font-medium">{saveStatus}</p>
            </div>
        )}

        <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">
        {/* Displaying the current file name */}
        {displayFileName} - Markdown Editor
        </h1>

        {/* Controls */}
        <div className="bg-white max-w-5xl w-full border border-gray-200 rounded-xl shadow-lg p-3 mb-4 flex gap-3 flex-wrap justify-center">
        <Button
        onClick={handleNewWindow} // <--- NEW WINDOW BUTTON
        className="bg-purple-600 text-white hover:bg-purple-700"
        disabled={isSaving}
        >
        ➕ New Window
        </Button>
        <Button
        onClick={openFileDialog}
        className="bg-blue-600 text-white hover:bg-blue-700"
        disabled={isSaving}
        >
        📂 Open File
        </Button>
        <Button
        onClick={saveFileDialog} // Triggers the save IPC request
        className="bg-green-600 text-white hover:bg-green-700"
        disabled={isSaving}
        >
        {fileName ? "💾 Save" : "💾 Save As..."}
        </Button>
        <Button
        onClick={exportHtmlDialog} // <--- EXPORT HTML BUTTON
        className="bg-yellow-600 text-white hover:bg-yellow-700"
        disabled={isSaving}
        >
        📄 Export HTML
        </Button>
        <Button
        onClick={clearEditor}
        className="bg-red-500 text-white hover:bg-red-600"
        disabled={isSaving}
        >
        🧹 New Document
        </Button>
        </div>

        {/* Editor and Preview Area */}
        <div className="grid md:grid-cols-2 gap-4 max-w-5xl w-full flex-grow">
        <div className="flex flex-col">
        <label htmlFor="markdown" className="text-lg font-medium text-gray-700 mb-2">
        Markdown Source
        </label>
        <textarea
        id="markdown"
        className="bg-white border border-gray-300 rounded-xl shadow-inner p-4 text-sm font-mono flex-grow focus:ring-blue-500 focus:border-blue-500 transition duration-150 ease-in-out resize-none w-full min-h-[50vh]"
        onChange={(e) => setMarkedText(e.target.value)}
        value={markedText}
        placeholder="Start typing your Markdown here..."
        >
        </textarea>
        </div>

        <div className="flex flex-col">
        <h2 className="text-lg font-medium text-gray-700 mb-2">
        HTML Preview
        </h2>
        <div className="bg-white border border-gray-300 rounded-xl shadow-inner p-4 flex-grow overflow-y-auto prose max-w-none w-full min-h-[50vh]">
        <div
        // NOTE: This attribute is necessary to inject raw HTML into the DOM.
        // Use it with caution, as it can open security vulnerabilities (XSS)
        // if the markdown source is not trusted or sanitized.
        dangerouslySetInnerHTML={{ __html: htmlMarkup }}
        />
        </div>
        </div>
        </div>
        </div>
    );
};

export default App;
