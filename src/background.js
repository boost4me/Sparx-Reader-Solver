const MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro"
];

const FREE_TIER_RATE_LIMIT = 1000;
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

async function enforceRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < FREE_TIER_RATE_LIMIT) {
    const waitTime = FREE_TIER_RATE_LIMIT - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms`);
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
      throw new Error("API Key not configured");
    }

    if (modelIndex >= MODELS.length) {
      throw new Error("All models failed");
    }

    const model = MODELS[modelIndex];
    console.log(`Attempting with model: ${model}`);
    
    await enforceRateLimit();

    const systemPrompt = `You are a reading comprehension assistant. Answer ONLY with the letter (A, B, C, D, or E) of the correct answer based on the provided text. If unsure, answer only: UNSURE`;

    const userMessage = `Reading Material:\n${extract}\n\nQuestion:\n${question}\n\nAnswer with ONLY the letter (A, B, C, D, E) or UNSURE.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: { text: systemPrompt }
        },
        contents: [{
          parts: [{ text: userMessage }]
        }],
        generationConfig: {
          maxOutputTokens: 10,
          temperature: 0.3,
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(JSON.stringify(error));
    }

    const data = await response.json();
    
    if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
      throw new Error("Invalid response structure");
    }

    const result = data.candidates[0].content.parts[0].text.trim();
    console.log(`Success with ${model}: ${result}`);
    return result;
    
  } catch (error) {
    console.error(`Error with model ${modelIndex}:`, error.message);
    
    const errorStr = error.message || '';
    
    if (errorStr.includes('401') || errorStr.includes('UNAUTHENTICATED')) {
      throw new Error("Invalid API key");
    }
    
    if (errorStr.includes('403') || errorStr.includes('PERMISSION_DENIED')) {
      throw new Error("API key lacks permissions");
    }
    
    if (errorStr.includes('429') || errorStr.includes('RESOURCE_EXHAUSTED')) {
      throw new Error("Rate limited - please wait");
    }

    // Try fallback model
    if (modelIndex < MODELS.length - 1) {
      console.log(`Trying fallback model ${modelIndex + 2}...`);
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
          error: error.message || "Unknown error"
        });
      });
    return true;
  }
});

console.log("✓ Background service worker ready");
