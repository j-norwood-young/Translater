// popup.js - handles interaction with the extension's popup, sends requests to the
// service worker (background.js), and updates the popup's UI (popup.html) on completion.

const inputElement = document.getElementById('text');
const outputElement = document.getElementById('output');
const sourceLangSelect = document.getElementById('sourceLang');
const targetLangSelect = document.getElementById('targetLang');
const modelStatusElement = document.getElementById('model-status');

let translationTimeout = null;
let isTranslating = false;
let modelLoaded = false;
let detectingModelLoaded = false;
let currentModelType = null; // 'detection' or 'translation'
let fileProgressTrackers = {}; // Track individual file progress

// Debounce function to limit how often translations occur
function debounce(func, delay) {
    return function (...args) {
        clearTimeout(translationTimeout);
        
        // Show loading immediately when user starts typing
        const text = inputElement.value;
        if (text.trim() && !isTranslating) {
            // Show model loading status if model isn't loaded yet and this is first time
            if (!modelLoaded) {
                showModelStatus();
            }
            showLoading();
            isTranslating = true;
        }
        
        translationTimeout = setTimeout(() => func.apply(this, args), delay);
    };
}

// Function to show loading state
const showLoading = () => {
    outputElement.innerHTML = '<div class="loading"><div class="spinner"></div>Translating...</div>';
};

// Function to perform translation
const performTranslation = () => {
    const text = inputElement.value;
    if (!text.trim()) {
        outputElement.innerHTML = '';
        isTranslating = false;
        return;
    }

    // Show loading spinner immediately
    showLoading();
    isTranslating = true;

    const sourceLang = sourceLangSelect.value;
    const targetLang = targetLangSelect.value;
    
    // Determine if we should auto-detect or manually translate
    const useAutoDetect = sourceLang === 'auto';

    // Bundle the input data into a message.
    const message = {
        action: useAutoDetect ? 'auto-detect' : 'translate',
        text: text,
        sourceLang: sourceLang,
        targetLang: targetLang,
    }

    // Send this message to the service worker.
    chrome.runtime.sendMessage(message, (response) => {
        isTranslating = false;
        modelLoaded = true;
        detectingModelLoaded = true;
        hideModelStatus();
        
        if (useAutoDetect && response && response.detected_language) {
            // Show detected language and translation
            const detectedLang = response.detected_language.toUpperCase();
            const translation = response.translation?.translated_text || 
                             response.translation?.[0]?.translation_text || 
                             response.translation;
            outputElement.innerHTML = `<div class="detected-lang">Detected: ${detectedLang}</div>\n<div class="translation">${translation}</div>`;
        } else {
            // Handle regular translation results
            if (response && response.translated_text) {
                outputElement.innerHTML = response.translated_text;
            } else if (response && response[0] && response[0].translation_text) {
                outputElement.innerHTML = response[0].translation_text;
            } else if (response) {
                outputElement.innerHTML = response.translated_text || JSON.stringify(response, null, 2);
            }
        }
    });
};

// Function to show model loading status
const showModelStatus = () => {
    if (!modelLoaded) {
        modelStatusElement.classList.remove('hidden');
    }
};

// Function to create or update a file progress bar
const updateFileProgress = (file, progress, loaded, total) => {
    const container = document.getElementById('file-progress-container');
    if (!container) return;
    
    // Create a unique ID for this file
    const fileId = file.replace(/[^a-zA-Z0-9]/g, '_');
    let fileElement = document.getElementById(`file-${fileId}`);
    
    // Create the file progress element if it doesn't exist
    if (!fileElement) {
        fileElement = document.createElement('div');
        fileElement.id = `file-${fileId}`;
        fileElement.className = 'file-progress-item';
        
        const fileName = document.createElement('div');
        fileName.className = 'file-name';
        fileName.textContent = getFileName(file);
        
        const progressBar = document.createElement('div');
        progressBar.className = 'file-progress-bar';
        
        const progressFill = document.createElement('div');
        progressFill.className = 'file-progress-fill';
        
        progressBar.appendChild(progressFill);
        fileElement.appendChild(fileName);
        fileElement.appendChild(progressBar);
        container.appendChild(fileElement);
    }
    
    // Update the progress fill
    const progressFill = fileElement.querySelector('.file-progress-fill');
    if (progressFill) {
        progressFill.style.width = `${progress}%`;
    }
    
    // If progress is 100%, fade out and remove after 500ms
    if (progress >= 100) {
        setTimeout(() => {
            if (fileElement) {
                fileElement.classList.add('fade-out');
                setTimeout(() => {
                    if (fileElement && fileElement.parentNode) {
                        fileElement.parentNode.removeChild(fileElement);
                        
                        // Check if all files are done loading - if container is empty, hide model status
                        if (container.children.length === 0 && !modelLoaded) {
                            hideModelStatus();
                        }
                    }
                }, 500);
            }
        }, 500);
    }
};

// Helper function to get a clean filename for display
const getFileName = (filePath) => {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1];
    // Remove file extension for cleaner display
    return fileName.replace(/\.(onnx|bin|json|txt)$/, '');
};

// Function to hide model loading status
const hideModelStatus = () => {
    modelStatusElement.classList.add('hidden');
    
    // Clear any remaining file progress items
    const container = document.getElementById('file-progress-container');
    if (container) {
        container.innerHTML = '';
    }
};

// Create a debounced version of the translation function (300ms delay)
const debouncedTranslate = debounce(performTranslation, 300);

// Listen for changes made to the textbox with debouncing.
inputElement.addEventListener('input', debouncedTranslate);

// Listen for changes in language selection (no debounce - immediate translation).
sourceLangSelect.addEventListener('change', () => {
    if (!modelLoaded && inputElement.value.trim()) {
        showModelStatus();
    }
    performTranslation();
});
targetLangSelect.addEventListener('change', () => {
    if (!modelLoaded && inputElement.value.trim()) {
        showModelStatus();
    }
    performTranslation();
});

// Listen for progress updates from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'progress') {
        const { file, progress, loaded, total } = message;
        if (file) {
            updateFileProgress(file, progress, loaded, total);
        }
    }
});
