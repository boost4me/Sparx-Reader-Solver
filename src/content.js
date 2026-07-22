let lastExtract = "";
let lastQuestion = "";
let isProcessing = false;

function getText(start, end) {
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
    return "";
  }
}

function sendMessage(prompt, extract) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 30000);
    chrome.runtime.sendMessage({ action: "generate", prompt, extract }, (res) => {
      clearTimeout(timeout);
      if (res?.success) resolve(res.result);
      else reject(new Error(res?.error || "Failed"));
    });
  });
}

const observer = new MutationObserver(() => {
  setTimeout(async () => {
    try {
      if (isProcessing) return;

      const extract = getText("Start reading here", "Stop reading here");
      if (extract && extract !== lastExtract) {
        lastExtract = extract;
        console.log("📖 Extract updated");
      }

      let question = getText("Q", "");
      if (!question) return;

      const matches = [...question.matchAll(/Q\d+\./g)];
      if (matches.length > 1) {
        question = question.replace(/Q\d+\.[^]*?(?=Q\d+\.)/, "");
      }
      question = question.trim();

      if (question !== lastQuestion && question.match(/^Q\d+\./)) {
        lastQuestion = question;

        if (!lastExtract) {
          alert("⚠️ Read the passage first");
          return;
        }

        isProcessing = true;
        try {
          const answer = await sendMessage(question, lastExtract);
          alert(`📚 Answer: ${answer}`);
        } catch (err) {
          alert("❌ " + err.message);
        } finally {
          isProcessing = false;
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, 800);
});

observer.observe(document.body, { childList: true, subtree: true });
console.log("✓ Ready");