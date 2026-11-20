/* EXUS IA - frontend corrigido */
(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const form = $("#chatForm");
  const promptInput = $("#prompt");
  const messages = $("#messages");
  const welcome = $("#welcome");
  const sendButton = $("#send");
  const conversation = $("#conversation");

  if (!form || !promptInput || !messages || !sendButton) {
    console.error("Exus IA: elementos principais não encontrados.");
    return;
  }

  const OWNER_EMAIL = "angelocalazans017@gmail.com";
  const SESSION_KEY = "exusia_session_id";
  const LOGIN_KEY = "exusia_google_login_v1";
  const CHATS_KEY = "exusia_chats_v1";
  const ACTIVE_KEY = "exusia_active_chat_v1";

  let googleToken = null;
  let isOwner = false;
  let resenhaMode = false;
  let resenhaEnabled = true;
  let screenStream = null;
  let screenTimer = null;
  let ownerRefreshTimer = null;
  let recognition = null;
  let disconnected = false;
  let chats = [];
  let activeChatId = null;

  function getSessionId() {
    let id = localStorage.getItem(SESSION_KEY);

    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : "exus" + Date.now() + Math.random().toString(36).slice(2);

      id = id.replaceAll("-", "");
      localStorage.setItem(SESSION_KEY, id);
    }

    return id;
  }

  const sessionId = getSessionId();

  function makeId() {
    return crypto.randomUUID
      ? crypto.randomUUID()
      : "chat-" + Date.now() + Math.random().toString(36).slice(2);
  }

  function loadChats() {
    try {
      const saved = JSON.parse(localStorage.getItem(CHATS_KEY) || "[]");
      chats = Array.isArray(saved) ? saved : [];
    } catch {
      chats = [];
    }

    activeChatId = localStorage.getItem(ACTIVE_KEY);

    if (!chats.some(chat => chat.id === activeChatId)) {
      activeChatId = chats[0]?.id || null;
    }

    if (!activeChatId) createChat(false);

    saveChats();
  }

  function saveChats() {
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 60)));

    if (activeChatId) {
      localStorage.setItem(ACTIVE_KEY, activeChatId);
    }

    renderChatList();
  }

  function activeChat() {
    return chats.find(chat => chat.id === activeChatId);
  }

  function createChat(render = true) {
    const chat = {
      id: makeId(),
      title: "Nova conversa",
      messages: [],
      updatedAt: Date.now()
    };

    chats.unshift(chat);
    activeChatId = chat.id;
    saveChats();

    if (render) renderConversation();
  }

  function renderChatList() {
    const list = $("#chatHistoryList");
    if (!list) return;

    list.innerHTML = "";

    chats.sort((a, b) => b.updatedAt - a.updatedAt);

    chats.forEach(chat => {
      const item = document.createElement("div");
      item.className =
        "exus-history-item" +
        (chat.id === activeChatId ? " active" : "");

      const open = document.createElement("button");
      open.type = "button";
      open.className = "exus-history-open";
      open.textContent = chat.title || "Conversa";

      open.onclick = () => {
        activeChatId = chat.id;
        saveChats();
        renderConversation();
        closeSidebar();
      };

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "exus-history-delete";
      remove.textContent = "×";
      remove.title = "Apagar conversa";

      remove.onclick = () => {
        if (!confirm("Apagar esta conversa?")) return;

        chats = chats.filter(entry => entry.id !== chat.id);

        if (activeChatId === chat.id) {
          activeChatId = chats[0]?.id || null;

          if (!activeChatId) createChat(false);
        }

        saveChats();
        renderConversation();
      };

      item.append(open, remove);
      list.appendChild(item);
    });
  }

  function renderConversation() {
    messages.innerHTML = "";

    const chat = activeChat();
    const items = chat?.messages || [];

    if (!items.length) {
      if (welcome) welcome.style.display = "block";
    } else {
      if (welcome) welcome.style.display = "none";

      items.forEach(item => {
        addMessage(item.content, item.role, false);
      });
    }

    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }
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

    if (conversation) {
      conversation.scrollTop = conversation.scrollHeight;
    }

    if (save) {
      const chat = activeChat();

      if (chat) {
        chat.messages.push({
          role: type,
          content: String(text)
        });

        if (type === "user" && chat.title === "Nova conversa") {
          chat.title = String(text).slice(0, 34);
        }

        chat.updatedAt = Date.now();
        saveChats();
      }
    }

    return content;
  }

  function closeSidebar() {
    $("#exusSidebar")?.classList.remove("open");
    $("#exusSidebarBackdrop")?.classList.remove("show");
  }

  function buildSidebar() {
    if (!$("#exusSidebar")) {
      const sidebar = document.createElement("aside");

      sidebar.id = "exusSidebar";
      sidebar.className = "exus-sidebar";

      sidebar.innerHTML = `
        <div class="exus-sidebar-head">
          <div class="exus-sidebar-brand">✦ EXUS IA</div>
          <button type="button" id="exusSidebarClose">×</button>
        </div>

        <button type="button" id="exusNewChat" class="exus-new-chat">
          ＋ Nova conversa
        </button>

        <div class="exus-history-label">SUAS CONVERSAS</div>
        <div id="chatHistoryList" class="exus-history-list"></div>

        <div class="exus-sidebar-foot">
          Suas conversas ficam salvas neste dispositivo.
        </div>
      `;

      document.body.appendChild(sidebar);

      const backdrop = document.createElement("div");
      backdrop.id = "exusSidebarBackdrop";
      backdrop.className = "exus-sidebar-backdrop";

      document.body.appendChild(backdrop);

      $("#exusSidebarClose").onclick = closeSidebar;
      backdrop.onclick = closeSidebar;

      $("#exusNewChat").onclick = () => {
        createChat(true);
        closeSidebar();
        promptInput.focus();
      };
    }

    if (!$("#exusMenuButton")) {
      const button = document.createElement("button");

      button.id = "exusMenuButton";
      button.type = "button";
      button.className = "exus-menu-button";
      button.setAttribute("aria-label", "Abrir conversas");

      button.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
      `;

      button.onclick = () => {
        $("#exusSidebar").classList.add("open");
        $("#exusSidebarBackdrop").classList.add("show");
      };

      const topbar = $(".topbar");

      if (topbar) {
        topbar.prepend(button);
      } else {
        document.body.prepend(button);
      }
    }

    renderChatList();
  }

  function addStyles() {
    if ($("#exusEnhancementStyles")) return;

    const style = document.createElement("style");

    style.id = "exusEnhancementStyles";

    style.textContent = `
      .exus-menu-button {
        width:42px;
        height:42px;
        display:flex;
        flex-direction:column;
        justify-content:center;
        gap:5px;
        align-items:center;
        background:#171322;
        border:1px solid #49336c;
        border-radius:12px;
        cursor:pointer;
        margin-right:12px;
        flex-shrink:0;
      }

      .exus-menu-button span {
        display:block;
        width:19px;
        height:2px;
        border-radius:4px;
        background:#d7c3ff;
      }

      .exus-sidebar {
        position:fixed;
        z-index:10001;
        inset:0 auto 0 0;
        width:min(310px,86vw);
        padding:18px;
        background:#100d18;
        border-right:1px solid #49336c;
        transform:translateX(-105%);
        transition:transform .25s ease;
        display:flex;
        flex-direction:column;
        box-shadow:15px 0 50px #0008;
      }

      .exus-sidebar.open {
        transform:translateX(0);
      }

      .exus-sidebar-backdrop {
        position:fixed;
        z-index:10000;
        inset:0;
        background:#0009;
        opacity:0;
        pointer-events:none;
        transition:opacity .2s;
      }

      .exus-sidebar-backdrop.show {
        opacity:1;
        pointer-events:auto;
      }

      .exus-sidebar-head {
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-bottom:22px;
      }

      .exus-sidebar-brand {
        font-weight:900;
        letter-spacing:2px;
        color:#d9c2ff;
      }

      #exusSidebarClose {
        background:transparent;
        color:#fff;
        border:0;
        font-size:28px;
      }

      .exus-new-chat {
        padding:13px;
        border:1px solid #8053bd;
        border-radius:12px;
        background:linear-gradient(120deg,#6d35aa,#3c2362);
        color:white;
        font-weight:700;
        text-align:left;
      }

      .exus-history-label {
        font-size:11px;
        letter-spacing:1.5px;
        color:#9e8eb6;
        margin:24px 0 10px;
      }

      .exus-history-list {
        overflow:auto;
        display:flex;
        flex-direction:column;
        gap:7px;
      }

      .exus-history-item {
        display:flex;
        align-items:center;
        gap:5px;
        border-radius:9px;
        background:#1a1524;
      }

      .exus-history-item.active {
        outline:1px solid #8053bd;
        background:#282039;
      }

      .exus-history-open {
        flex:1;
        min-width:0;
        text-align:left;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        background:transparent;
        border:0;
        color:#eee;
        padding:12px;
      }

      .exus-history-delete {
        background:transparent;
        border:0;
        color:#a99bb8;
        padding:8px 12px;
        font-size:18px;
      }

      .exus-sidebar-foot {
        margin-top:auto;
        padding-top:16px;
        color:#887b99;
        font-size:11px;
      }

      .speak-message {
        margin-left:8px;
        background:transparent;
        border:0;
        cursor:pointer;
      }

      @media(max-width:600px) {
        .exus-menu-button {
          width:38px;
          height:38px;
          margin-right:8px;
        }

        .topbar {
          display:flex;
          align-items:center;
        }
      }
    `;

    document.head.appendChild(style);
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

  function updateModeLabel() {
    let label = $("#modeLabel");

    if (!label && $(".topbar")) {
      label = document.createElement("div");
      label.id = "modeLabel";
      label.className = "mode-label";
      $(".topbar").appendChild(label);
    }

    if (label) {
      label.textContent = resenhaMode
        ? "😂 MODO RESENHA"
        : "✦ MODO NORMAL";
    }
  }

  function setDisconnected(message) {
    if (disconnected) return;

    disconnected = true;

    form.querySelectorAll("button,textarea").forEach(el => {
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
        <button id="reloadExus" type="button">Voltar ao início</button>
      </div>
    `;

    $("p", overlay).textContent =
      message || "Sua conexão com a Exus IA foi encerrada.";

    $("#reloadExus", overlay).onclick = () => {
      localStorage.removeItem(SESSION_KEY);
      location.reload();
    };

    document.body.appendChild(overlay);
  }

  async function heartbeat() {
    if (disconnected) return;

    try {
      const headers = {
        "Content-Type": "application/json"
      };

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

  async function sendMessage(text) {
    if (!text.trim() || disconnected) return;

    if (welcome) welcome.style.display = "none";

    addMessage(text, "user");

    const chat = activeChat();

    const apiMessages = (chat?.messages || [])
      .filter(item => ["user", "assistant"].includes(item.role))
      .slice(-20);

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
          messages: apiMessages,
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

      const speak = document.createElement("button");
      speak.className = "speak-message";
      speak.type = "button";
      speak.textContent = "🔊";
      speak.title = "Ouvir resposta";
      speak.onclick = () => speakText(answer);

      loading.parentElement.appendChild(speak);

      const current = activeChat();

      current.messages.push({
        role: "assistant",
        content: answer
      });

      current.updatedAt = Date.now();
      saveChats();

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

  document.querySelectorAll("[data-prompt]").forEach(button => {
    button.addEventListener("click", () => {
      promptInput.value = button.dataset.prompt;
      promptInput.focus();
    });
  });

  $("#newChat")?.addEventListener("click", () => createChat(true));

  async function completeLogin(credential, persist = true) {
    const status = $("#ownerStatus");

    if (status) status.textContent = "Verificando conta...";

    const result = await fetch("/api/auth/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        credential,
        sessionId
      })
    });

    const data = await result.json();

    if (!result.ok) {
      throw new Error(data.error || "Falha no login.");
    }

    googleToken = credential;
    isOwner = !!data.isOwner;

    if (persist) {
      localStorage.setItem(
        LOGIN_KEY,
        JSON.stringify({
          credential,
          savedAt: Date.now(),
          email: data.email
        })
      );
    }

    if (status) {
      status.textContent = isOwner
        ? "👑 DONO: " + data.email
        : "Usuário: " + data.email;

      status.style.color = isOwner ? "#c5a5ff" : "#aaa";
    }

    await heartbeat();

    if (isOwner) createOwnerPanel();
  }

  window.handleGoogleLogin = async function(response) {
    try {
      await completeLogin(response.credential);
    } catch (error) {
      localStorage.removeItem(LOGIN_KEY);

      const status = $("#ownerStatus");

      if (status) {
        status.textContent = "Erro: " + error.message;
      }
    }
  };

  async function restoreLogin() {
    try {
      const saved = JSON.parse(
        localStorage.getItem(LOGIN_KEY) || "null"
      );

      if (!saved?.credential) return;

      if (Date.now() - saved.savedAt > 55 * 60 * 1000) {
        localStorage.removeItem(LOGIN_KEY);
        return;
      }

      await completeLogin(saved.credential, false);

    } catch {
      localStorage.removeItem(LOGIN_KEY);
    }
  }

  function createOwnerPanel() {
    if ($("#ownerPanelButton")) return;

    const button = document.createElement("button");

    button.id = "ownerPanelButton";
    button.className = "owner-panel-button";
    button.type = "button";
    button.textContent = "👑 Painel Supremo";
    button.onclick = openOwnerPanel;

    (
      $(".topbar-right") ||
      $(".topbar") ||
      document.body
    ).appendChild(button);
  }

  async function openOwnerPanel() {
    let panel = $("#ownerPanel");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "ownerPanel";
      panel.className = "owner-panel";
      document.body.appendChild(panel);
    }

    panel.innerHTML = `
      <div class="owner-panel-content owner-panel-large">

        <button class="owner-close" id="closeOwnerPanel" type="button">
          ✕
        </button>

        <div class="owner-heading">👑 PAINEL SUPREMO</div>

        <p class="owner-subtitle">
          EXUS IA • Central de administração
        </p>

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
          <div id="ownerSessions">Carregando...</div>
        </div>

              <div class="owner-card">
          <strong>Contas Google</strong>
          <div id="ownerUsers">Carregando...</div>
        </div>

        <div class="owner-card">
          <strong>Telas compartilhadas</strong>
          <p>
            Só aparecem telas que o usuário autorizou no navegador.
          </p>
          <div id="ownerScreens">Carregando...</div>
        </div>

      </div>
    `;

    panel.style.display = "flex";

    $("#closeOwnerPanel").onclick = () => {
      panel.style.display = "none";
      clearInterval(ownerRefreshTimer);
    };

    try {
      const settings = await adminRequest("/api/admin/settings");

      resenhaEnabled = settings.resenhaEnabled;

      const toggle = $("#resenhaToggle");
      toggle.checked = resenhaEnabled;

      toggle.onchange = async () => {
        try {
          const result = await adminRequest(
            "/api/admin/settings",
            {
              method: "POST",
              body: JSON.stringify({
                resenhaEnabled: toggle.checked
              })
            }
          );

          resenhaEnabled = result.settings.resenhaEnabled;

        } catch (error) {
          alert(error.message);
          toggle.checked = !toggle.checked;
        }
      };

      await refreshOwnerPanel();

      clearInterval(ownerRefreshTimer);

      ownerRefreshTimer = setInterval(
        refreshOwnerPanel,
        4000
      );

    } catch (error) {
      $("#ownerSessions").textContent = error.message;
    }
  }

  async function refreshOwnerPanel() {
    if (
      !isOwner ||
      !$("#ownerPanel") ||
      $("#ownerPanel").style.display !== "flex"
    ) return;

    try {
      const data = await adminRequest("/api/admin/users");

      const sessionsBox = $("#ownerSessions");
      const usersBox = $("#ownerUsers");

      sessionsBox.innerHTML = "";

      const active = data.sessions.filter(
        session => session.online && !session.disconnected
      );

      if (!active.length) {
        sessionsBox.textContent = "Nenhum usuário conectado.";
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

        info.append(name, email);

        const action = document.createElement("button");
        action.type = "button";
        action.textContent = "Desconectar";

        action.onclick = async () => {
          if (!confirm("Desconectar esta sessão?")) return;

          try {
            await adminRequest(
              "/api/admin/sessions/disconnect",
              {
                method: "POST",
                body: JSON.stringify({
                  sessionId: session.id
                })
              }
            );

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
        usersBox.textContent = "Nenhuma conta registrada.";
      }

      data.users.forEach(user => {
        const item = document.createElement("div");
        item.className = "owner-user";

        const email = document.createElement("span");
        email.textContent = user.email;

        const action = document.createElement("button");
        action.type = "button";
        action.textContent = user.blocked
          ? "Desbloquear"
          : "Bloquear";

        action.onclick = async () => {
          try {
            await adminRequest(
              "/api/admin/users/block",
              {
                method: "POST",
                body: JSON.stringify({
                  email: user.email,
                  blocked: !user.blocked
                })
              }
            );

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

  async function refreshSharedScreens() {
    const box = $("#ownerScreens");

    if (!box) return;

    try {
      const data = await adminRequest("/api/admin/screens");

      box.innerHTML = "";

      if (!data.screens.length) {
        box.textContent =
          "Ninguém está compartilhando a tela agora.";
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

    } catch {
      box.textContent = "Não foi possível carregar as telas.";
    }
  }

  function createScreenShareButton() {
    const bottom = $(".composer-bottom");

    if (!bottom || $("#shareScreenButton")) return;

    const button = document.createElement("button");

    button.id = "shareScreenButton";
    button.className = "extra-action";
    button.type = "button";
    button.textContent = "▣ Compartilhar tela";
    button.onclick = startScreenShare;

    bottom.insertBefore(button, bottom.firstChild);
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert("Seu navegador não permite compartilhar a tela.");
      return;
    }

    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });

      const video = document.createElement("video");
      video.srcObject = screenStream;
      video.muted = true;

      await video.play();

      const started = await fetch("/api/screen/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sessionId })
      });

      if (!started.ok) {
        throw new Error("Não foi possível iniciar o compartilhamento.");
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      const button = $("#shareScreenButton");

      button.textContent = "■ Parar compartilhamento";
      button.onclick = stopScreenShare;

      screenTimer = setInterval(async () => {
        if (!screenStream || !video.videoWidth) return;

        const scale = Math.min(1, 1100 / video.videoWidth);

        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        try {
          await fetch("/api/screen/frame", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              sessionId,
              frame: canvas.toDataURL("image/jpeg", 0.5)
            })
          });
        } catch (error) {
          console.warn(error);
        }

      }, 1800);

      screenStream.getVideoTracks()[0].addEventListener(
        "ended",
        stopScreenShare
      );

    } catch (error) {
      alert(error.message || "Compartilhamento cancelado.");
      stopScreenShare();
    }
  }

  async function stopScreenShare() {
    if (screenTimer) clearInterval(screenTimer);

    screenTimer = null;

    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }

    screenStream = null;

    const button = $("#shareScreenButton");

    if (button) {
      button.textContent = "▣ Compartilhar tela";
      button.onclick = startScreenShare;
    }

    try {
      await fetch("/api/screen/stop", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ sessionId })
      });
    } catch {}
  }

  function createVoiceButton() {
    const bottom = $(".composer-bottom");

    if (!bottom || $("#voiceButton")) return;

    const button = document.createElement("button");

    button.id = "voiceButton";
    button.className = "extra-action";
    button.type = "button";
    button.textContent = "🎙 Falar";
    button.onclick = startVoiceRecognition;

    bottom.appendChild(button);
  }

  function startVoiceRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Ditado por voz não disponível neste navegador.");
      return;
    }

    recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;

    recognition.onresult = event => {
      promptInput.value = (
        promptInput.value + " " +
        event.results[0][0].transcript
      ).trim();

      promptInput.focus();
    };

    recognition.onerror = () => {
      recognition = null;
    };

    recognition.onend = () => {
      recognition = null;
    };

    recognition.start();
  }

  function speakText(text) {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "pt-BR";

    window.speechSynthesis.speak(utterance);
  }

  addStyles();
  buildSidebar();
  loadChats();
  renderConversation();
  updateModeLabel();
  createScreenShareButton();
  createVoiceButton();

  heartbeat();
  setInterval(heartbeat, 15000);

  restoreLogin();

})();
