import { GoogleGenAI } from "@google/genai";

document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKeyInput');
  const saveKeyBtn = document.getElementById('saveKeyBtn');
  const testKeyBtn = document.getElementById('testKeyBtn');
  const statusDiv = document.getElementById('status');

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
      showStatus('Please enter an API key!', 'error');
      return;
    }

    try {
      chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
        showStatus('✓ API Key saved successfully!', 'success');
        console.log('API Key saved');
      });
    } catch (error) {
      showStatus('✗ Error saving API Key: ' + error.message, 'error');
      console.error('Save error:', error);
    }
  });

  // Test button handler
  testKeyBtn.addEventListener('click', async () => {
    try {
      const apiKeyObject = await chrome.storage.local.get(['geminiApiKey']);
      const apiKey = apiKeyObject["geminiApiKey"] || '';

      if (!apiKey) {
        showStatus('✗ No API key found! Please save an API key first.', 'error');
        return;
      }

      testKeyBtn.disabled = true;
      testKeyBtn.textContent = 'Testing...';
      showStatus('Testing API key with Gemini 3.6 Flash...', 'info');

      const ai = new GoogleGenAI({ apiKey: apiKey });

      const response = await Promise.race([
        ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: "Say only: API Key works",
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), 15000)
        )
      ]);

      if (response && response.text) {
        showStatus('✓ API Key is valid! Gemini 3.6 Flash is responding.', 'success');
      } else {
        showStatus('✗ Unexpected response from API', 'error');
      }
    } catch (error) {
      console.error('Test error:', error);
      
      let errorMessage = 'Error testing API Key: ' + error.message;
      
      if (error.message && error.message.includes('timeout')) {
        errorMessage = '✗ Request timeout. Check your connection and API key.';
      } else if (error.message && error.message.includes('403')) {
        errorMessage = '✗ Forbidden: Your API key may not have access to Gemini 3.6 Flash. Make sure you have Gemini API enabled.';
      } else if (error.message && error.message.includes('401')) {
        errorMessage = '✗ Invalid API key. Please check your Gemini API key.';
      } else if (error.message && error.message.includes('429')) {
        errorMessage = '✗ Rate limited. You\'ve exceeded your API quota. Please wait or upgrade your plan.';
      } else if (error.message && error.message.includes('400')) {
        errorMessage = '✗ Bad request. The API might not support Gemini 3.6 Flash yet. Try with free tier limits.';
      }
      
      showStatus(errorMessage, 'error');
    } finally {
      testKeyBtn.disabled = false;
      testKeyBtn.textContent = 'Test Key';
    }
  });

  function showStatus(message, type) {
    if (!statusDiv) return;
    
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';
    
    if (type === 'success') {
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 3000);
    }
  }
});