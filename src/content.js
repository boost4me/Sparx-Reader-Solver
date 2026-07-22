console.log("✓ Content script loaded on Sparx Reader");

let lastExtract = "";
let lastQuestion = "";
let isProcessing = false;
const DEBOUNCE = 800;
let debounceTimer = null;

function sendToBackground(prompt, extract) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("30s timeout"));
    }, 30000);

    chrome.runtime.sendMessage(
      { action: "generate", prompt, extract },
      (response) => {
        clearTimeout(timeout);
        if (!response) {
          reject(new Error("No response"));
          return;
        }
        if (response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response.error));
        }
      }
    );
  });
}

function copyTextBetween(start, end) {
  try {
    const text = document.body.innerText || "";
    const startIdx = text.indexOf(start);
    if (startIdx === -1) return "";
    
    if (end) {
      const endIdx = text.indexOf(end, startIdx + start.length);
      if (endIdx === -1) return "";
      return text.substring(startIdx + start.length, endIdx).trim();
    }
    return text.substring(startIdx).trim();
  } catch (e) {
    console.error("Error extracting:", e);
    return "";
  }
}

const observer = new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(checkForQuestions, DEBOUNCE);
});

async function checkForQuestions() {
  try {
    if (isProcessing) return;

    // Get reading extract
    const extractEl = document.querySelector('[class*="read-content"]');
    if (extractEl) {
      const text = copyTextBetween("Start reading here", "Stop reading here");
      if (text && text !== lastExtract) {
        lastExtract = text;
        console.log("📖 Extract found:", text.substring(0, 50) + "...");
      }
    }

    // Get question
    const questionEl = document.querySelector('[class*="Question"]');
    if (questionEl) {
      let text = copyTextBetween("Q", "A)");
      if (!text) text = copyTextBetween("Q", "");
      
      if (!text) return;

      // Remove multiple questions, keep only current
      const matches = [...text.matchAll(/Q\d+\./g)];
      if (matches.length > 1) {
        text = text.replace(/Q\d+\.[^]*?(?=Q\d+\.)/, "");
      }

      text = text.trim();

      if (text !== lastQuestion && text.match(/^Q\d+\./)) {
        lastQuestion = text;

        if (!lastExtract) {
          alert("⚠️ Read the passage first");
          return;
        }

        isProcessing = true;
        try {
          console.log("🤖 Generating answer...");
          const answer = await sendToBackground(text, lastExtract);
          console.log("✓ Answer:", answer);
          alert(`📚 Answer: ${answer}`);
        } catch (err) {
          console.error("❌ Error:", err);
          let msg = err.message;
          
          if (msg.includes("API key")) msg = "🔑 Check your API key in settings";
          else if (msg.includes("429") || msg.includes("quota")) msg = "⏱️ Rate limited, wait a moment";
          else if (msg.includes("timeout")) msg = "⏳ Request timeout";
          
          alert("❌ " + msg);
        } finally {
          isProcessing = false;
        }
      }
    }
  } catch (err) {
    console.error("❌", err);
  }
}

observer.observe(document.body, { childList: true, subtree: true });

console.log("✓ Sparx Reader Solver ready");
