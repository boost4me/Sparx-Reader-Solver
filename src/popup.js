import { GoogleGenAI } from "@google/genai";

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const testKeyBtn = document.getElementById('testKeyBtn');

  // Load saved API key on popup open
  chrome.storage.local.get(['geminiApiKey'], (result) => {
    if (result.geminiApiKey) {
      apiKeyInput.value = result.geminiApiKey;
    }
  });

  // Save button handler
  saveKeyBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      alert('Please enter an API key!');
      return;
    }

    try {
      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        alert('API Key saved successfully!');
        console.log('API Key saved');
      });
    } catch (error) {
      alert('Error saving API Key: ' + error.message);
      console.error('Save error:', error);
    }
  });

  // Test button handler
  testKeyBtn.addEventListener('click', async () => {
    try {
      const apiKeyObject = await chrome.storage.local.get(['geminiApiKey']);
      const apiKey = apiKeyObject["geminiApiKey"] || '';

      if (!apiKey) {
        alert('No API key found! Please save an API key first.');
        return;
      }

      testKeyBtn.disabled = true;
      testKeyBtn.textContent = 'Testing...';

      const ai = new GoogleGenAI({ apiKey: apiKey });

      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-2.0-flash-lite",
          contents: "Say only: API Key works",
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 10000)
        )
      ]);

      if (response && response.text) {
        alert('✓ API Key is valid! Response: ' + response.text);
      } else {
        alert('Error: Unexpected response from API');
      }
    } catch (error) {
      console.error('Test error:', error);
      
      if (error.message.includes('timeout')) {
        alert('Request timeout. Please check your connection and API key.');
      } else if (error.message.includes('403') || error.message.includes('401')) {
        alert('Invalid API key. Please check your Gemini API key is correct.');
      } else if (error.message.includes('429')) {
        alert('Rate limited. Please wait before testing again.');
      } else {
        alert('Error testing API Key: ' + error.message);
      }
    } finally {
      testKeyBtn.disabled = false;
      testKeyBtn.textContent = 'Test Key';
    }
  });
});