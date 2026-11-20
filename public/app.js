const form = document.getElementById("chatForm");
const promptInput = document.getElementById("prompt");
const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const sendButton = document.getElementById("send");

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message";
  div.textContent = text;
  div.dataset.type = type;
  messages.appendChild(div);
  return div;
}

async function sendMessage(text) {
  if (!text.trim()) return;

  welcome.style.display = "none";
  addMessage(text, "user");

  const loading = addMessage("A Exus IA está pensando...", "assistant");

  sendButton.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao consultar a IA.");
    }

    loading.textContent = data.reply || "Não recebi uma resposta.";
  } catch (error) {
    loading.textContent = "Erro: " + error.message;
  } finally {
    sendButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text) return;

  promptInput.value = "";
  sendMessage(text);
});

document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    promptInput.focus();
  });
});

document.getElementById("newChat").addEventListener("click", () => {
  messages.innerHTML = "";
  welcome.style.display = "block";
});
