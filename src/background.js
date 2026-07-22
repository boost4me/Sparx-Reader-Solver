import { GoogleGenAI } from "@google/genai";

const MODEL_CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const AVAILABLE_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash"
];

async function getAPIKey() {
    try {
        const apiKeyObject = await chrome.storage.local.get(['geminiApiKey']);
        return apiKeyObject["geminiApiKey"] || '';
    } catch (error) {
        console.error("Error retrieving API key:", error);
        return '';
    }
}

async function fetchLatestModel() {
  try {
    // Fetch the latest model info from Google's model garden or use version check
    const response = await Promise.race([
      fetch('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyC', {
        method: 'GET'
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Fetch timeout')), 5000)
      )
    ]).catch(() => null);
    
    // For now, return the latest stable lightweight model
    return AVAILABLE_MODELS[0]; // gemini-2.0-flash-lite
  } catch (error) {
    console.log("Could not fetch latest model, using fallback:", error);
    return AVAILABLE_MODELS[0];
  }
}

async function getOrUpdateModel() {
  try {
    const storage = await chrome.storage.local.get(['lastModelCheck', 'currentModel']);
    const now = Date.now();
    
    if (!storage.lastModelCheck || (now - storage.lastModelCheck) > MODEL_CHECK_INTERVAL) {
      const latestModel = await fetchLatestModel();
      await chrome.storage.local.set({
        lastModelCheck: now,
        currentModel: latestModel
      });
      console.log("Model updated to:", latestModel);
      return latestModel;
    }
    
    return storage.currentModel || AVAILABLE_MODELS[0];
  } catch (error) {
    console.error("Error in model update check:", error);
    return AVAILABLE_MODELS[0];
  }
}

async function generateText(question, extract) {
  try {
    if (!question || !extract) {
      throw new Error("Question and extract are required");
    }

    const apiKey = await getAPIKey();
    if (!apiKey) {
      throw new Error("API Key not configured. Please set your Gemini API Key in the extension popup.");
    }

    const model = await getOrUpdateModel();
    console.log("Using model:", model);

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const chat = ai.chats.create({
      model: model,
      history: [
        {
          role: "user",
          parts: [{ text: `You will answer the question at the very bottom of the message that is written under Q1-Q4. Each new line under the question is a new possible answer. Do not be afraid not to choose an answer if you truly believe the student should try themselves. Answer ONLY with the letter of the correct answer, for example: A or B or C or D or E. If you cannot determine an answer from the extract provided, respond with UNSURE. Your response must ONLY be the letter(s) of the answer or UNSURE.` }],
        },
        {
          role: "model",
          parts: [{ text: "Yes, I understand. I will read the extract you provide and will use it to answer your questions. I will provide ONLY the answer and nothing else." }],
        },
        {
          role: "user",
          parts: [{ text: extract }],
        },
        {
          role: "model",
          parts: [{ text: "I have read and understood the extract and will use it to answer your questions." }],
        },
      ],
    });

    const response = await chat.sendMessage({
      message: question,
    });

    if (!response || !response.text) {
      throw new Error("Invalid response from API");
    }

    return response.text;
  } catch (error) {
    console.error("Error generating text:", error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "generate") {
    generateText(message.prompt, message.extract)
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
    await getOrUpdateModel();
    console.log("Extension started - model check completed");
  } catch (error) {
    console.error("Error during startup model check:", error);
  }
});

// Also check periodically in the background
setInterval(async () => {
  try {
    await getOrUpdateModel();
  } catch (error) {
    console.error("Error during periodic model check:", error);
  }
}, MODEL_CHECK_INTERVAL);