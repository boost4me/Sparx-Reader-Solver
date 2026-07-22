import { GoogleGenAI } from "@google/genai";

const LATEST_MODEL = "gemini-3.6-flash";
const FALLBACK_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.0-flash"
];

const MODEL_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const FREE_TIER_RATE_LIMIT = 1000; // ms between requests for free tier
const REQUEST_QUEUE = [];
let isProcessingQueue = false;
let lastRequestTime = 0;

async function getAPIKey() {
    try {
        const apiKeyObject = await chrome.storage.local.get(['geminiApiKey']);
        return apiKeyObject["geminiApiKey"] || '';
    } catch (error) {
        console.error("Error retrieving API key:", error);
        return '';
    }
}

async function checkLatestModel() {
  try {
    const storage = await chrome.storage.local.get(['lastModelCheck', 'currentModel']);
    const now = Date.now();
    
    if (!storage.lastModelCheck || (now - storage.lastModelCheck) > MODEL_CHECK_INTERVAL) {
      // Try to fetch latest available models
      await chrome.storage.local.set({
        lastModelCheck: now,
        currentModel: LATEST_MODEL
      });
      console.log("Model updated to:", LATEST_MODEL);
      return LATEST_MODEL;
    }
    
    return storage.currentModel || LATEST_MODEL;
  } catch (error) {
    console.error("Error checking model:", error);
    return LATEST_MODEL;
  }
}

async function enforceRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < FREE_TIER_RATE_LIMIT) {
    const waitTime = FREE_TIER_RATE_LIMIT - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

async function generateTextWithFallback(question, extract, modelIndex = 0) {
  try {
    if (!question || !extract) {
      throw new Error("Question and extract are required");
    }

    const apiKey = await getAPIKey();
    if (!apiKey) {
      throw new Error("API Key not configured. Please set your Gemini API Key in the extension popup.");
    }

    const model = modelIndex === 0 ? LATEST_MODEL : FALLBACK_MODELS[modelIndex - 1];
    if (!model) {
      throw new Error("No available models to use");
    }

    console.log(`Attempting with model: ${model}`);
    
    // Enforce rate limiting before making request
    await enforceRateLimit();

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const chat = ai.chats.create({
      model: model,
      systemInstruction: "You are a reading comprehension assistant. Answer ONLY with the letter (A, B, C, D, or E) of the correct answer based on the provided text extract. If you cannot determine the answer from the extract, respond with 'UNSURE'. No other text or explanation.",
      history: [
        {
          role: "user",
          parts: [{ text: "You will answer reading comprehension questions by selecting the correct answer from the options provided. Answer ONLY with the letter of your choice." }],
        },
        {
          role: "model",
          parts: [{ text: "Understood. I will answer with only the letter (A, B, C, D, or E) or 'UNSURE'." }],
        },
        {
          role: "user",
          parts: [{ text: `Here is the reading material:\n\n${extract}` }],
        },
        {
          role: "model",
          parts: [{ text: "I have read and understood the material. Ready to answer questions based only on this text." }],
        },
      ],
    });

    const response = await chat.sendMessage({
      message: question,
    });

    if (!response || !response.text) {
      throw new Error("Invalid response from API");
    }

    return response.text.trim();
  } catch (error) {
    console.error(`Error with model ${modelIndex}:`, error);
    
    // If we got a 429, inform the user
    if (error.message && error.message.includes('429')) {
      throw new Error("API rate limit exceeded. Please wait a moment and try again.");
    }
    
    // Try fallback models
    if (modelIndex < FALLBACK_MODELS.length) {
      console.log(`Trying fallback model ${modelIndex + 1}...`);
      return generateTextWithFallback(question, extract, modelIndex + 1);
    }
    
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "generate") {
    generateTextWithFallback(message.prompt, message.extract)
      .then(response => {
        sendResponse({ 
          success: true, 
          result: response 
        });
      })
      .catch(error => {
        console.error("Message handler error:", error);
        sendResponse({ 
          success: false, 
          error: error.message || "Unknown error occurred" 
        });
      });
    // Return true to indicate you want to send a response asynchronously
    return true;
  }
});

// Check and update model on extension startup
chrome.runtime.onStartup.addListener(async () => {
  try {
    await checkLatestModel();
    console.log("Extension started - using latest Gemini model");
  } catch (error) {
    console.error("Error during startup:", error);
  }
});

// Also check periodically in the background
setInterval(async () => {
  try {
    await checkLatestModel();
  } catch (error) {
    console.error("Error during periodic model check:", error);
  }
}, MODEL_CHECK_INTERVAL);