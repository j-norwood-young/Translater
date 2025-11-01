// content.js - the content scripts which is run in the context of web pages, and has access
// to the DOM and other web APIs.

console.log('Content script loaded and running');

// Create a floating translation button
const createTranslationButton = (x, y) => {
    // Remove any existing button
    const existingBtn = document.getElementById('translate-selected-btn');
    if (existingBtn) {
        existingBtn.remove();
    }

    const btn = document.createElement('div');
    btn.id = 'translate-selected-btn';
    btn.textContent = '🌐 Translate';
    btn.style.cssText = `
        position: fixed;
        left: ${x}px;
        top: ${y - 40}px;
        background: #3498db;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        user-select: none;
    `;

    return btn;
};

// Get selected text and show translation button
document.addEventListener('mouseup', async (event) => {
    console.log('Mouse up event fired');
    const selection = window.getSelection();
    const selectedText = selection.toString().trim();
    
    console.log('Selected text:', selectedText);
    
    if (selectedText.length > 0) {
        // Get the position of the selection
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        console.log('Creating translation button at:', rect.left, rect.top);
        
        // Create and show translation button
        const button = createTranslationButton(rect.left, rect.top);
        document.body.appendChild(button);
        console.log('Button added to DOM');
        
        // Handle button click - use mousedown to catch it before the removal listener
        button.addEventListener('mousedown', async (e) => {
            console.log('Button mousedown!');
            console.log('Captured selectedText:', selectedText);
            console.log('SelectedText length:', selectedText.length);
            e.stopPropagation();
            e.preventDefault(); // Prevent default behavior
            button.textContent = '⏳ Translating...';
            button.style.background = '#95a5a6';
            
            try {
                // Translate using auto-detect
                const message = {
                    action: 'auto-detect',
                    text: selectedText,
                    targetLang: 'en', // Default to English, could be configurable
                };
                
                console.log('Sending translation message:', message);
                console.log('Message text length:', message.text.length);
                
                chrome.runtime.sendMessage(message, (response) => {
                    console.log('=== CALLBACK FIRED ===');
                    console.log('Message sent, waiting for response...');
                    console.log('Full response received:', response);
                    console.log('Response type:', typeof response);
                    
                    if (chrome.runtime.lastError) {
                        console.error('chrome.runtime.lastError:', chrome.runtime.lastError);
                        button.textContent = '❌ Error: ' + chrome.runtime.lastError.message;
                        return;
                    }
                    
                    if (!response) {
                        console.error('No response received');
                        button.textContent = '❌ No response';
                        return;
                    }
                    
                    console.log('Response structure:', JSON.stringify(response, null, 2));
                    
                    // Extract translation from various possible response formats
                    let translation = '';
                    
                    // Log the response structure
                    console.log('Response type:', typeof response);
                    console.log('Response keys:', Object.keys(response || {}));
                    
                    // Try different response structures
                    if (typeof response === 'string') {
                        translation = response;
                    } else if (response.translated_text) {
                        translation = response.translated_text;
                    } else if (response.translation) {
                        if (typeof response.translation === 'string') {
                            translation = response.translation;
                        } else if (response.translation.translated_text) {
                            translation = response.translation.translated_text;
                        } else if (Array.isArray(response.translation) && response.translation[0]?.translation_text) {
                            translation = response.translation[0].translation_text;
                        } else if (Array.isArray(response.translation) && response.translation[0]) {
                            translation = response.translation[0];
                        }
                    } else if (Array.isArray(response)) {
                        if (response[0]?.translation_text) {
                            translation = response[0].translation_text;
                        } else if (response[0]) {
                            translation = response[0];
                        }
                    }
                    
                    console.log('Extracted translation:', translation);
                    console.log('Translation length:', translation?.length);
                    
                    if (translation && translation.length > 0) {
                        // Show translation in a popup near the button
                        console.log('Attempting to show popup');
                        
                        // Extract detected language if available
                        const detectedLang = response.detected_language ? response.detected_language.toUpperCase() : null;
                        
                        showTranslationPopup(button, selectedText, translation, detectedLang);
                        button.remove();
                    } else {
                        console.error('No translation found in response:', response);
                        button.textContent = '❌ No translation - see console';
                        // Log the full response for debugging
                        console.log('Full response object:', JSON.stringify(response, null, 2));
                    }
                });
            } catch (error) {
                console.error('Translation error:', error);
                button.textContent = '❌ Error: ' + error.message;
            }
        });
        
        // Remove button when clicked outside (small delay to ensure button listener is registered first)
        setTimeout(() => {
            document.addEventListener('mousedown', function removeBtnIfOutside(e) {
                // Don't remove if clicking on the button itself
                if (button && button.contains(e.target)) {
                    return;
                }
                console.log('Removing button - clicked outside');
                if (button) {
                    button.remove();
                }
            }, { once: true, capture: false });
        }, 10);
    }
});

// Show translation popup
const showTranslationPopup = (button, originalText, translation, detectedLang = null) => {
    // Ensure translation is a string
    const translationText = typeof translation === 'string' ? translation : 
                           translation?.translated_text || 
                           translation?.[0]?.translation_text || 
                           JSON.stringify(translation);
    
    const rect = button.getBoundingClientRect();
    
    const popup = document.createElement('div');
    popup.id = 'translation-popup';
    popup.style.cssText = `
        position: fixed;
        left: ${Math.min(rect.left, window.innerWidth - 450)}px;
        top: ${Math.min(rect.top + rect.height + 10, window.innerHeight - 300)}px;
        max-width: 400px;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        z-index: 999999;
        font-size: 16px;
        line-height: 1.5;
        font-family: 'Roboto', sans-serif;
    `;
    
    // Build popup content similar to extension popup
    let content = '';
    if (detectedLang) {
        content += `<div style="display: inline-block; font-size: 12px; padding: 4px 8px; background-color: #3498db; color: white; border-radius: 4px; margin-bottom: 8px; font-weight: 500;">Detected: ${detectedLang}</div><br>`;
    }
    content += `<div style="word-wrap: break-word;">${escapeHtml(translationText)}</div>`;
    
    popup.innerHTML = content;
    
    document.body.appendChild(popup);
    
    // Close on click anywhere
    setTimeout(() => {
        document.addEventListener('click', function closeOnClick(event) {
            if (!popup.contains(event.target)) {
                popup.remove();
                document.removeEventListener('click', closeOnClick);
            }
        });
    }, 100);
};

// Helper function to escape HTML
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};
