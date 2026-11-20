
const form = document.getElementById("chatForm");
const promptInput = document.getElementById("prompt");
const messages = document.getElementById("messages");
const welcome = document.getElementById("welcome");
const sendButton = document.getElementById("send");
const conversation = document.getElementById("conversation");

const OWNER_EMAIL = "angelocalazans017@gmail.com";
const HISTORY_KEY = "exusia_history_v2";
const SESSION_KEY = "exusia_session_id";

let googleToken = null;
let isOwner = false;
let resenhaMode = false;
let conversationHistory = [];
let resenhaEnabled = true;
let screenStream = null;
let screenTimer = null;
let ownerRefreshTimer = null;
let recognition = null;
let disconnected = false;

const sessionId = getSessionId();

function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);

  if (!id) {
    id = crypto.randomUUID
      ? crypto.randomUUID().replaceAll("-", "")
      : "exus" + Date.now() + Math.random().toString(36).slice(2);

    localStorage.setItem(SESSION_KEY, id);
  }

  return id;
}

function addMessage(text, type, save = true) {
  const div = document.createElement("div");
  div.className = "message";
  div.dataset.type = type;

  const content = document.createElement("span");
  content.textContent = text;
  div.appendChild(content);

  if (type === "assistant") {
    const speak = document.createElement("button");
    speak.className = "speak-message";
    speak.type = "button";
    speak.textContent = "🔊";
    speak.title = "Ouvir resposta";
    speak.onclick = () => speakText(text);
    div.appendChild(speak);
  }

  messages.appendChild(div);
  conversation.scrollTop = conversation.scrollHeight;

  if (save) saveHistory();
  return content;
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory));
  } catch (error) {
    console.warn("Não foi possível salvar o histórico.", error);
  }
}

function loadHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");

    if (!Array.isArray(saved)) return;

    conversationHistory = saved.slice(-40);

    if (conversationHistory.length) {
      welcome.style.display = "none";

      conversationHistory.forEach(item => {
        if (["user", "assistant"].includes(item.role)) {
          addMessage(item.content, item.role, false);
        }
      });
    }
  } catch {
    conversationHistory = [];
  }
}

function updateModeLabel() {
  let label = document.getElementById("modeLabel");

  if (!label) {
    label = document.createElement("div");
    label.id = "modeLabel";
    label.className = "mode-label";
    document.querySelector(".topbar").appendChild(label);
  }

  label.textContent = resenhaMode
    ? "😂 MODO RESENHA"
    : "✦ MODO NORMAL";
}

function setDisconnected(message) {
  if (disconnected) return;

  disconnected = true;
  form.querySelectorAll("button, textarea").forEach(el => {
    el.disabled = true;
  });

  stopScreenShare();

  const overlay = document.createElement("div");
  overlay.className = "disconnect-overlay";
  overlay.innerHTML = `
    <div class="disconnect-card">
      <div class="disconnect-symbol">✦</div>
      <h2>Sessão encerrada</h2>
      <p></p>
      <button id="reloadExus">Voltar ao início</button>
    </div>
  `;

  overlay.querySelector("p").textContent =
    message || "Sua conexão com a Exus IA foi encerrada.";

  overlay.querySelector("#reloadExus").onclick = () => {
    localStorage.removeItem(SESSION_KEY);
    location.reload();
  };

  document.body.appendChild(overlay);
}

// PRESENÇA DOS USUÁRIOS
async function heartbeat() {
  if (disconnected) return;

  try {
    const headers = { "Content-Type": "application/json" };

    if (googleToken) {
      headers.Authorization = `Bearer ${googleToken}`;
    }

    const response = await fetch("/api/presence", {
      method: "POST",
      headers,
      body: JSON.stringify({ sessionId })
    });

    const data = await response.json();

    if (response.status === 403 && data.disconnected) {
      setDisconnected(data.error);
    }
  } catch (error) {
    console.warn("Falha ao atualizar presença.", error);
  }
}

heartbeat();
setInterval(heartbeat, 15000);

// CHAT
async function sendMessage(text) {
  if (!text.trim() || disconnected) return;

  welcome.style.display = "none";
  addMessage(text, "user");

  conversationHistory.push({
    role: "user",
    content: text
  });

  saveHistory();

  const loading = addMessage(
    resenhaMode
      ? "KKKK segura aí, tô preparando a resenha..."
      : "A Exus IA está pensando...",
    "assistant",
    false
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
        sessionId,
        messages: conversationHistory,
        mode: resenhaMode ? "resenha" : "normal"
      })
    });

    const data = await response.json();

    if (response.status === 403 && data.disconnected) {
      setDisconnected(data.error);
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || "Erro ao consultar a IA.");
    }

    const answer = data.reply || data.answer || "Não recebi uma resposta.";
    loading.textContent = answer;

    const parent = loading.parentElement;
    const speak = document.createElement("button");
    speak.className = "speak-message";
    speak.type = "button";
    speak.textContent = "🔊";
    speak.title = "Ouvir resposta";
    speak.onclick = () => speakText(answer);
    parent.appendChild(speak);

    conversationHistory.push({
      role: "assistant",
      content: answer
    });

    saveHistory();
  } catch (error) {
    loading.textContent = "Erro: " + error.message;
  } finally {
    if (!disconnected) {
      sendButton.disabled = false;
      promptInput.focus();
    }
  }
}

form.addEventListener("submit", event => {
  event.preventDefault();

  let text = promptInput.value.trim();
  if (!text || disconnected) return;

  promptInput.value = "";

  if (/\bmodo resenha\b/i.test(text)) {
    if (!resenhaEnabled) {
      addMessage(
        "O modo resenha está desativado pelo administrador.",
        "assistant"
      );
      return;
    }

    resenhaMode = true;
    text = text.replace(/\bmodo resenha\b/i, "").trim();
    updateModeLabel();

    addMessage(
      "😂 MODO RESENHA ATIVADO! Agora é só resenha, mas continuo respondendo de verdade!",
      "assistant"
    );

    if (!text) return;
  }

  if (/\bmodo normal\b/i.test(text)) {
    resenhaMode = false;
    text = text.replace(/\bmodo normal\b/i, "").trim();
    updateModeLabel();

    addMessage("Modo normal ativado. 😎", "assistant");
    if (!text) return;
  }

  sendMessage(text);
});

// SUGESTÕES
document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    promptInput.value = button.dataset.prompt;
    promptInput.focus();
  });
});

// NOVA CONVERSA
document.getElementById("newChat").addEventListener("click", () => {
  messages.innerHTML = "";
  conversationHistory = [];
  localStorage.removeItem(HISTORY_KEY);
  welcome.style.display = "block";
  promptInput.value = "";
});

updateModeLabel();
loadHistory();

// LOGIN GOOGLE
window.handleGoogleLogin = async function(response) {
  const status = document.getElementById("ownerStatus");
  status.textContent = "Verificando conta...";

  try {
    const result = await fetch("/api/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        credential: response.credential,
        sessionId
      })
    });

    const data = await result.json();

    if (!result.ok) throw new Error(data.error || "Falha no login.");

    googleToken = response.credential;
    isOwner = data.isOwner;

    status.textContent = isOwner
      ? "👑 DONO: " + data.email
      : "Usuário: " + data.email;

    status.style.color = isOwner ? "#c5a5ff" : "#aaa";

    heartbeat();

    if (isOwner) createOwnerPanel();
  } catch (error) {
    status.textContent = "Erro: " + error.message;
  }
};

// BOTÃO DO PAINEL DO DONO
function createOwnerPanel() {
  if (document.getElementById("ownerPanelButton")) return;

  const button = document.createElement("button");
  button.id = "ownerPanelButton";
  button.className = "owner-panel-button";
  button.textContent = "👑 Painel Supremo";
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

  if (!response.ok) {
    throw new Error(data.error || "Erro administrativo.");
  }

  return data;
}

// PAINEL DO DONO
async function openOwnerPanel() {
  let panel = document.getElementById("ownerPanel");

  if (!panel) {
    panel = document.createElement("div");
    panel.id = "ownerPanel";
    panel.className = "owner-panel";
    document.body.appendChild(panel);
  }

  panel.innerHTML = `
    <div class="owner-panel-content owner-panel-large">
      <button class="owner-close" id="closeOwnerPanel">✕</button>
      <div class="owner-heading">👑 PAINEL SUPREMO</div>
      <p class="owner-subtitle">EXUS IA • Central de administração</p>

      <div class="owner-card">
        <strong>Proprietário</strong>
        <p>${OWNER_EMAIL}</p>
        <span class="owner-tag">DONO VERIFICADO</span>
      </div>

      <div class="owner-card">
        <strong>Controle da IA</strong>
        <label class="owner-toggle">
          <input type="checkbox" id="resenhaToggle">
          <span>Permitir Modo Resenha</span>
        </label>
      </div>

      <div class="owner-card">
        <strong>Usuários conectados</strong>
        <p>Atualização automática das sessões do site.</p>
        <div id="ownerSessions">Carregando sessões...</div>
      </div>

      <div class="owner-card">
        <strong>Contas Google</strong>
        <div id="ownerUsers">Carregando contas...</div>
      </div>

      <div class="owner-card">
        <strong>Compartilhamento autorizado</strong>
        <p>Somente telas que o próprio usuário decidiu compartilhar aparecem aqui.</p>
        <div id="ownerScreens">Aguardando compartilhamentos...</div>
      </div>

      <p class="owner-note">
        As sessões, bloqueios e configurações ficam em memória nesta versão.
        O compartilhamento termina quando o usuário para ou sai do site.
      </p>
    </div>
  `;

  panel.style.display = "flex";

  document.getElementById("closeOwnerPanel").onclick = () => {
    panel.style.display = "none";
    clearInterval(ownerRefreshTimer);
    ownerRefreshTimer = null;
  };

  try {
    const settings = await adminRequest("/api/admin/settings");
    resenhaEnabled = settings.resenhaEnabled;

    const toggle = document.getElementById("resenhaToggle");
    toggle.checked = resenhaEnabled;

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
          resenhaEnabled
            ? "👑 O dono habilitou o Modo Resenha."
            : "👑 O dono desabilitou o Modo Resenha.",
          "assistant"
        );
      } catch (error) {
        alert(error.message);
        toggle.checked = !toggle.checked;
      }
    };

    await refreshOwnerPanel();

    clearInterval(ownerRefreshTimer);
    ownerRefreshTimer = setInterval(refreshOwnerPanel, 3000);
  } catch (error) {
    document.getElementById("ownerSessions").textContent = error.message;
  }
}

async function refreshOwnerPanel() {
  if (!isOwner || !document.getElementById("ownerPanel") ||
      document.getElementById("ownerPanel").style.display !== "flex") {
    return;
  }

  try {
    const data = await adminRequest("/api/admin/users");
    const sessionsBox = document.getElementById("ownerSessions");
    const usersBox = document.getElementById("ownerUsers");

    sessionsBox.innerHTML = "";

    const active = data.sessions.filter(session =>
      session.online && !session.disconnected
    );

    if (!active.length) {
      sessionsBox.textContent = "Nenhum usuário conectado neste momento.";
    }

    active.forEach(session => {
      const item = document.createElement("div");
      item.className = "owner-user";

      const info = document.createElement("div");
      info.className = "owner-user-info";

      const name = document.createElement("strong");
      name.textContent = session.name || "Visitante";

      const email = document.createElement("small");
      email.textContent = session.email || "Sem login Google";

      const status = document.createElement("small");
      status.textContent = session.sharing
        ? "🟣 Compartilhando tela"
        : "🟢 Online";

      info.append(name, email, status);

      const action = document.createElement("button");
      action.textContent = "Desconectar";
      action.onclick = async () => {
        if (!confirm("Deseja desconectar esta sessão?")) return;

        try {
          await adminRequest("/api/admin/sessions/disconnect", {
            method: "POST",
            body: JSON.stringify({ sessionId: session.id })
          });

          await refreshOwnerPanel();
        } catch (error) {
          alert(error.message);
        }
      };

      item.append(info, action);
      sessionsBox.appendChild(item);
    });

    usersBox.innerHTML = "";

    if (!data.users.length) {
      usersBox.textContent = "Nenhuma conta Google registrada ainda.";
    }

    data.users.forEach(user => {
      const item = document.createElement("div");
      item.className = "owner-user";

      const email = document.createElement("span");
      email.textContent = user.email;

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

          await refreshOwnerPanel();
        } catch (error) {
          alert(error.message);
        }
      };

      item.append(email, action);
      usersBox.appendChild(item);
    });

    await refreshSharedScreens();
  } catch (error) {
    console.error(error);
  }
}

// TELAS QUE OS USUÁRIOS AUTORIZARAM COMPARTILHAR
async function refreshSharedScreens() {
  const box = document.getElementById("ownerScreens");
  if (!box) return;

  try {
    const data = await adminRequest("/api/admin/screens");
    box.innerHTML = "";

    if (!data.screens.length) {
      box.textContent = "Nenhum usuário está compartilhando a tela agora.";
      return;
    }

    data.screens.forEach(screen => {
      const card = document.createElement("div");
      card.className = "owner-screen-card";

      const title = document.createElement("strong");
      title.textContent = screen.name || screen.email || "Usuário";

      const image = document.createElement("img");
      image.src = screen.frame;
      image.alt = "Tela compartilhada com autorização";

      card.append(title, image);
      box.appendChild(card);
    });
  } catch (error) {
    box.textContent = "Não foi possível carregar as telas.";
  }
}

// COMPARTILHAMENTO: O USUÁRIO PRECISA CLICAR E ACEITAR
function createScreenShareButton() {
  const bottom = document.querySelector(".composer-bottom");
  if (!bottom || document.getElementById("shareScreenButton")) return;

  const button = document.createElement("button");
  button.id = "shareScreenButton";
  button.className = "extra-action";
  button.type = "button";
  button.textContent = "▣ Compartilhar tela";

  button.onclick = startScreenShare;
  bottom.insertBefore(button, bottom.firstChild);
}

async function startScreenShare() {
  if (disconnected) return;

  if (!navigator.mediaDevices?.getDisplayMedia) {
    alert("Seu navegador não permite compartilhamento de tela. Tente pelo Chrome em um computador compatível.");
    return;
  }

  try {
    // O navegador sempre mostra a escolha e pede autorização ao usuário.
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    const video = document.createElement("video");
    video.srcObject = screenStream;
    video.muted = true;
    await video.play();

    const startResponse = await fetch("/api/screen/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });

    if (!startResponse.ok) {
      throw new Error("Não foi possível iniciar o compartilhamento.");
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    const shareButton = document.getElementById("shareScreenButton");
    shareButton.textContent = "■ Parar compartilhamento";
    shareButton.classList.add("sharing");

    shareButton.onclick = stopScreenShare;

    screenTimer = setInterval(async () => {
      if (!screenStream || !video.videoWidth) return;

      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = canvas.toDataURL("image/jpeg", 0.55);

      try {
        const response = await fetch("/api/screen/frame", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, frame })
        });

        if (response.status === 403) {
          stopScreenShare();
        }
      } catch (error) {
        console.warn("Falha ao enviar imagem da tela.", error);
      }
    }, 1500);

    screenStream.getVideoTracks()[0].addEventListener("ended", stopScreenShare);

    addMessage(
      "Você autorizou o compartilhamento da tela. O dono poderá visualizá-la enquanto estiver ativo.",
      "assistant"
    );
  } catch (error) {
    if (error.name !== "NotAllowedError") {
      alert(error.message || "Não foi possível compartilhar a tela.");
    }
    stopScreenShare();
  }
}

async function stopScreenShare() {
  if (screenTimer) {
    clearInterval(screenTimer);
    screenTimer = null;
  }

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  const button = document.getElementById("shareScreenButton");

  if (button) {
    button.textContent = "▣ Compartilhar tela";
    button.classList.remove("sharing");
    button.onclick = startScreenShare;
  }

  try {
    await fetch("/api/screen/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId })
    });
  } catch {}
}

createScreenShareButton();

// VOZ: DITAR PERGUNTAS
function createVoiceButton() {
  const bottom = document.querySelector(".composer-bottom");
  if (!bottom || document.getElementById("voiceButton")) return;

  const button = document.createElement("button");
  button.id = "voiceButton";
  button.className = "extra-action";
  button.type = "button";
  button.textContent = "🎙 Falar";

  button.onclick = startVoiceRecognition;
  bottom.insertBefore(button, document.getElementById("shareScreenButton"));
}

function startVoiceRecognition() {
  const SpeechRecognition =
    window.
