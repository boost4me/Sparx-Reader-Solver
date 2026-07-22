console.log("Sparx Reader Solver content script loaded");

let lastExtract = "";
let lastQuestion = "";
let startingValue = "Q0.";
let isProcessing = false;
const DEBOUNCE_DELAY = 500;
let debounceTimer = null;

function requestGeneration(prompt, extract) {
  return new Promise((resolve, reject) => {
    if (!prompt || !extract) {
      reject(new Error("Prompt and extract are required"));
      return;
    }

    chrome.runtime.sendMessage(
      { action: "generate", prompt: prompt, extract: extract },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        if (response && response.success) {
          resolve(response.result);
        } else {
          reject(new Error(response?.error || "Failed to generate response"));
        }
      }
    );
  });
}

function copyTextParagraph(startAt, endAt) {
    try {
        const allText = document.body.innerText;
        if (!allText) return "";

        const startIndex = allText.indexOf(startAt);
        if (startIndex === -1) return "";

        if (endAt) {
          const afterStartIndex = startIndex + startAt.length;
          const endIndex = allText.indexOf(endAt, afterStartIndex);
          
          if (endIndex === -1) return "";
          return allText.substring(afterStartIndex, endIndex).trim();
        }
        return allText.substring(startIndex).trim();
    } catch (error) {
        console.error("Error copying text:", error);
        return "";
    }
}

const observer = new MutationObserver((mutations) => {
    try {
        // Debounce to avoid excessive processing
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processQuestions, DEBOUNCE_DELAY);
    } catch (error) {
        console.error("Error in mutation observer:", error);
    }
});

async function processQuestions() {
    try {
        if (isProcessing) return;

        const extractRead = document.querySelector('[class^="read-content"]');
        const questionRead = document.querySelector('[class="PanelPaperbackQuestionContainer"]');

        if (extractRead) {
            const copiedText = copyTextParagraph('Start reading here', 'Stop reading here');
            if (copiedText && lastExtract !== copiedText) {
                lastExtract = copiedText;
                console.log("Extract updated");
            }
        } 
        
        if (questionRead) {
            let copiedText = copyTextParagraph('Q');
            if (!copiedText) return;

            // Match all question starts
            const matches = [...copiedText.matchAll(/Q\d+\./g)];

            let updatedText = copiedText;

            if (matches.length > 1) {
                // If more than one question, remove the first one
                updatedText = copiedText.replace(/Q\d+\.[\ s\S]*?(?=Q\d+\.)/, '');
            }

            copiedText = updatedText.trim();
            
            if ((copiedText !== lastQuestion) && !(copiedText.startsWith(startingValue))) {
                startingValue = copiedText.slice(0, 3);
                lastQuestion = copiedText;

                if (!lastExtract) {
                  console.log("No extract available yet");
                  return;
                }

                isProcessing = true;
                try {
                    const result = await requestGeneration(copiedText, lastExtract);
                    console.log("Generated answer:", result);
                    
                    // Show result with better formatting
                    const formattedResult = `Answer: ${result}`;
                    alert(formattedResult);
                } catch (error) {
                    console.error("Generation error:", error);
                    alert("Error: " + error.message);
                } finally {
                    isProcessing = false;
                }
            }
        }
    } catch (error) {
        console.error("Error processing questions:", error);
    }
}

observer.observe(document.body, { childList: true, subtree: true });

console.log("Sparx Reader Solver initialized successfully");