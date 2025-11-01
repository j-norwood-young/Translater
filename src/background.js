// background.js - Handles requests from the UI, runs the model, then sends back a response

import { pipeline } from '@huggingface/transformers';

// Pipeline Manager for Translation
class TranslationPipeline {
    static task = 'translation';
    static model = 'Xenova/m2m100_418M';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (!this.instance) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

// Pipeline Manager for Language Detection
class LanguageDetectionPipeline {
    static task = 'text-classification';
    static model = 'onnx-community/language_detection-ONNX';
    static instance = null;

    static async getInstance(progress_callback = null) {
        if (!this.instance) {
            this.instance = pipeline(this.task, this.model, { progress_callback });
        }
        return this.instance;
    }
}

// Create translation function
const translate = async (text, sourceLang = 'en', targetLang = 'fr', onProgress = null) => {
    // Get the pipeline instance. This will load and build the model when run for the first time.
    let model = await TranslationPipeline.getInstance((data) => {
        // You can track the progress of the pipeline creation here.
        console.log('Translation model loading progress', data);
        if (onProgress) {
            onProgress(data);
        }
    });

    // Actually run the model on the input text
    let result = await model(text, { src_lang: sourceLang, tgt_lang: targetLang, device: 'webgpu' });
    return result;
};

// Create language detection function
const detectLanguage = async (text, onProgress = null) => {
    // Get the pipeline instance
    let model = await LanguageDetectionPipeline.getInstance((data) => {
        console.log('Language detection model loading progress', data);
        if (onProgress) {
            onProgress(data);
        }
    });

    // Run language detection
    let result = await model(text);
    return result;
};

// Map NLLB language codes to m2m100 2-character codes
const mapLanguageCodeToM2M100 = (langCode) => {
    // Map NLLB format (e.g., "nld_Latn") to m2m100 format (e.g., "nl")
    const mapping = {
        'eng_Latn': 'en',
        'nld_Latn': 'nl',
        'spa_Latn': 'es',
        'fra_Latn': 'fr',
        'deu_Latn': 'de',
        'ita_Latn': 'it',
        'por_Latn': 'pt',
        'rus_Cyrl': 'ru',
        'jpn_Jpan': 'ja',
        'kor_Hang': 'ko',
        'zho_Hans': 'zh',
        'arb_Arab': 'ar',
        'hin_Deva': 'hi',
        'pol_Latn': 'pl',
        'tur_Latn': 'tr',
        'ces_Latn': 'cs',
        'ron_Latn': 'ro',
        'ukr_Cyrl': 'uk',
        'hye_Armn': 'hy',
        'bul_Cyrl': 'bg',
        'slk_Latn': 'sk',
        'slv_Latn': 'sl',
        'hrv_Latn': 'hr',
        'bos_Latn': 'bs',
        'srp_Cyrl': 'sr',
        'mkd_Cyrl': 'mk',
        'kat_Geor': 'ka',
        'eus_Latn': 'eu',
        'cat_Latn': 'ca',
        'glg_Latn': 'gl',
    };
    
    // If already in correct format, return as is
    if (langCode && langCode.length === 2) {
        return langCode;
    }
    
    // Try to map from NLLB format
    if (mapping[langCode]) {
        return mapping[langCode];
    }
    
    // Fallback: extract 2-letter code from format like "nld_Latn" or "nld" or "eng"
    if (langCode.includes('_')) {
        // Format: "nld_Latn" -> extract first part
        const langPart = langCode.split('_')[0];
        return langPart.substring(0, 2);
    }
    
    // Just take first 2 characters
    return langCode.substring(0, 2);
};

// Combined function: detect language then translate
const autoDetectAndTranslate = async (text, targetLang = 'fr', onProgress = null) => {
    // First, detect the language
    const detectedLang = await detectLanguage(text, onProgress);
    console.log('Detected language:', detectedLang);
    
    // Get the detected language code
    const detectedLanguageCode = detectedLang.label || detectedLang[0]?.label;
    
    // Map to m2m100 format (2-character codes)
    const m2m100Code = mapLanguageCodeToM2M100(detectedLanguageCode);
    
    console.log('Detected language code:', detectedLanguageCode, '-> m2m100:', m2m100Code);
    
    // Then translate using the detected language
    const result = await translate(text, m2m100Code, targetLang, onProgress);
    
    return {
        detected_language: detectedLanguageCode,
        detected_m2m100_code: m2m100Code,
        translation: result
    };
};


////////////////////// 1. Context Menus //////////////////////
//
// Add a listener to create the initial context menu items,
// context menu items only need to be created at runtime.onInstalled
chrome.runtime.onInstalled.addListener(function () {
    // Register a context menu item that will only show up for selection text.
    chrome.contextMenus.create({
        id: 'translate-selection',
        title: 'Translate "%s"',
        contexts: ['selection'],
    });
});

// Perform inference when the user clicks a context menu
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // Ignore context menu clicks that are not for translations (or when there is no input)
    if (info.menuItemId !== 'translate-selection' || !info.selectionText) return;

    // Perform translation on the selected text
    let result = await translate(info.selectionText);

    // Do something with the result
    chrome.scripting.executeScript({
        target: { tabId: tab.id },    // Run in the tab that the user clicked in
        args: [result],               // The arguments to pass to the function
        function: (result) => {       // The function to run
            // NOTE: This function is run in the context of the web page, meaning that `document` is available.
            console.log('result', result)
            console.log('document', document)
        },
    });
});
//////////////////////////////////////////////////////////////

////////////////////// 2. Message Events /////////////////////
// 
// Listen for messages from the UI, process it, and send the result back.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('sender', sender);
    
    // Run model prediction asynchronously
    (async function () {
        try {
            // Progress callback to send updates to the UI
            const onProgress = (data) => {
                if (data && data.status === 'progress') {
                    // Send progress update to the popup
                    chrome.runtime.sendMessage({
                        type: 'progress',
                        progress: data.progress,
                        file: data.file,
                        loaded: data.loaded,
                        total: data.total
                    }).catch(() => {}); // Ignore errors if no listener
                }
            };

            if (message.action === 'translate') {
                // Perform manual translation with specified languages
                let result = await translate(message.text, message.sourceLang, message.targetLang, onProgress);
                sendResponse(result);
            } else if (message.action === 'auto-detect') {
                // Auto-detect language and translate
                let result = await autoDetectAndTranslate(message.text, message.targetLang, onProgress);
                sendResponse(result);
            }
        } catch (error) {
            console.error('Translation error:', error);
            sendResponse({ error: error.message });
        }
    })();

    // return true to indicate we will send a response asynchronously
    // see https://stackoverflow.com/a/46628145 for more information
    return true;
});
//////////////////////////////////////////////////////////////

