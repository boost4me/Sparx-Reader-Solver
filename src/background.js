async function getAPIKey() {
    const result = await chrome.storage.local.get(['geminiApiKey']);
    return result.geminiApiKey || '';
}

async function generateAnswer(question, extract) {
  try {
    const apiKey = await getAPIKey();
    if (!apiKey) {
      throw new Error("API Key not set");
    }

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `TASK: Answer a Sparx Reader reading comprehension question.

TEXT:
${extract}

QUESTION:
${question}

RULES:
- Answer ONLY with ONE letter: A, B, C, D, or E
- Base answer ONLY on the text provided
- If unsure, answer: UNSURE
- NO explanations, just the letter`
          }]
        }],
        generationConfig: {
          maxOutputTokens: 5,
          temperature: 0.3
        }
      })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(JSON.stringify(err));
    }

    const data = await response.json();
    if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
      throw new Error('Invalid API response');
    }

    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "generate") {
    generateAnswer(message.prompt, message.extract)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

console.log('✓ Background ready');