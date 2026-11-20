
const form = document.getElementById("chatForm");
const promptInput = document.getElementById("prompt");
const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const sendButton = document.getElementById("send");

let googleToken = null;
let isOwner = false;
let resenhaMode = false;
let conversationHistory = [];
let resenhaEnabled = true;

function addMessage(text, type) {
  const div = document.createElement("div");
  div.className = "message";
  div.dataset.type = type;
  div.textContent = text;
  messages.appendChild(div);

  document.getElementById("conversation").scrollTop =
    document.getElementById("conversation").scrollHeight;

  return div;
}

function updateModeLabel() {
  let label = document.getElementById("modeLabel");

  if (!label) {
    label = document.createElement("div");
    label.id = "modeLabel";
    label.className = "mode-label";
    document.querySelector(".topbar").appendChild(label);
  }

  label.textContent = resenhaMode ? "😂 MODO RESENHA ATIVO" : "✦ MODO NORMAL";
}

async function sendMessage(text) {
  if (!text.trim()) return;

  welcome.style.display = "none";
  addMessage(text, "user");

  conversationHistory.push({
    role: "user",
    content: text
  });

  const loading = addMessage(
    resenhaMode ? "KKKK segura aí, tô preparando a resenha..." : "A Exus IA está pensando...",
    "assistant"
  );

  sendButton.disabled = true;

  try {
    const headers = {
      "Content-Type": "application/json"
    };

    if (googleToken) {
      headers.Authorization = `Bearer ${googleToken}`;
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: conversationHistory,
        mode: resenhaMode ? "resenha" : "normal"
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Erro ao consultar a IA.");
    }

    loading.textContent = data.reply || data.answer || "Não recebi uma resposta.";

    conversationHistory.push({
      role: "assistant",
      content: loading.textContent
    });
  } catch (error) {
    loading.textContent = "Erro: " + error.message;
  } finally {
    sendButton.disabled = false;
    promptInput.focus();
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();

  let text = promptInput.value.trim();
  if (!text) return;

  promptInput.value = "";

  if (/\bmodo resenha\b/i.test(text)) {
    if (!resenhaEnabled) {
      addMessage("O modo resenha está desativado pelo administrador.", "assistant");
      return;
    }

    resenhaMode = true;
    text = text.replace(/\bmodo resenha\b/i, "").trim();
    updateModeLabel();

    addMessage("😂 MODO RESENHA ATIVADO! Agora é só resenha, mas eu continuo respondendo tudo!", "assistant");

    if (!text) return;
  }

  if (/\bmodo normal\b/i.test(text)) {
    resenhaMode = false;
    text = text.replace(/\bmodo normal\b/i, "").trim();
    updateModeLabel();

    addMessage("Modo normal ativado. Voltamos à inteligência e elegância. 😎", "assistant");

    if (!text) return;
  }

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
  conversationHistory = [];
  welcome.style.display = "block";
  promptInput.value = "";
});

updateModeLabel();

// LOGIN GOOGLE
window.handleGoogleLogin = async function(response) {
  const status = document.getElementById("ownerStatus");
  status.textContent = "Verificando conta...";

  try {
    const result = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: response.credential })
    });

    const data = await result.json();

    if (!result.ok) throw new Error(data.error);

    googleToken = response.credential;
    isOwner = data.isOwner;

    status.textContent = isOwner
      ? "👑 DONO: " + data.email
      : "Usuário: " + data.email;

    status.style.color = isOwner ? "#c5a5ff" : "#aaa";

    if (isOwner) {
      createOwnerPanel();
    }
  } catch (error) {
    status.textContent = "Erro: " + error.message;
  }
};

// PAINEL EXCLUSIVO DO DONO
function createOwnerPanel() {
  if (document.getElementById("ownerPanelButton")) return;

  const button = document.createElement("button");
  button.id = "ownerPanelButton";
  button.className = "owner-panel-button";
  button.textContent = "👑 Painel do Dono";
  button.onclick = openOwnerPanel;

  document.querySelector(".topbar-right").appendChild(button);
}

async function adminRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${googleToken}`,
      ...(options.headers || {})
    }
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Erro administrativo.");
  return data;
}

async function openOwnerPanel() {
  let panel = document.getElementById("ownerPanel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ownerPanel";
    panel.className = "owner-panel";
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="owner-panel-content">
      <button class="owner-close" id="closeOwnerPanel">✕</button>
      <div class="owner-heading">👑 PAINEL DO DONO</div>
      <p class="owner-subtitle">EXUS IA • Administração</p>

      <div class="owner-card">
        <strong>Proprietário</strong>
        <p>angelocalazans017@gmail.com</p>
        <span class="owner-tag">DONO VERIFICADO</span>
      </div>

      <div class="owner-card">
        <strong>Modo Resenha</strong>
        <p>Permitir que os usuários ativem o modo resenha.</p>
        <label class="owner-toggle">
          <input type="checkbox" id="resenhaToggle">
          <span>Modo Resenha habilitado</span>
        </label>
      </div>

      <div class="owner-card">
        <strong>Usuários com login Google</strong>
        <div id="ownerUsers">Carregando usuários...</div>
      </div>

      <p class="owner-note">
        As configurações e bloqueios desta versão ficam em memória e são reiniciados quando o servidor reinicia.
      </p>
    </div>
  `;

  panel.style.display = "flex";

  document.getElementById("closeOwnerPanel").onclick = () => {
    panel.style.display = "none";
  };

  try {
    const settings = await adminRequest("/api/admin/settings");
    const toggle = document.getElementById("resenhaToggle");

    resenhaEnabled = settings.resenhaEnabled;
    toggle.checked = settings.resenhaEnabled;

    toggle.onchange = async () => {
      try {
        const result = await adminRequest("/api/admin/settings", {
          method: "POST",
          body: JSON.stringify({
            resenhaEnabled: toggle.checked
          })
        });

        resenhaEnabled = result.settings.resenhaEnabled;
        addMessage(
          resenhaEnabled ? "👑 O dono habilitou o Modo Resenha." : "👑 O dono desabilitou o Modo Resenha.",
          "assistant"
        );
      } catch (error) {
        alert(error.message);
        toggle.checked = !toggle.checked;
      }
    };

    const userData = await adminRequest("/api/admin/users");
    const userContainer = document.getElementById("ownerUsers");

    if (!userData.users.length) {
      userContainer.textContent = "Nenhum usuário entrou com Google ainda.";
    } else {
      userContainer.innerHTML = "";

      userData.users.forEach(user => {
        const item = document.createElement("div");
        item.className = "owner-user";

        const info = document.createElement("span");
        info.textContent = user.email;

        const action = document.createElement("button");
        action.textContent = user.blocked ? "Desbloquear" : "Bloquear";

        action.onclick = async () => {
          try {
            await adminRequest("/api/admin/users/block", {
              method: "POST",
              body: JSON.stringify({
                email: user.email,
                blocked: !user.blocked
              })
            });

            openOwnerPanel();
          } catch (error) {
            alert(error.message);
          }
        };

        item.append(info, action);
        userContainer.appendChild(item);
      });
    }
  } catch (error) {
    document.getElementById("ownerUsers").textContent = error.message;
  }
      }
    
