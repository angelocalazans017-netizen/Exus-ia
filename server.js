
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "3mb" }));
app.use(express.static(path.join(__dirname, "public")));

const OWNER_EMAIL = "angelocalazans017@gmail.com";

let settings = {
  resenhaEnabled: true
};

const users = new Map();
const sessions = new Map();
const blockedUsers = new Set();

function validSessionId(id) {
  return typeof id === "string" &&
    /^[a-zA-Z0-9_-]{8,100}$/.test(id);
}

function cleanOldSessions() {
  const now = Date.now();

  for (const session of sessions.values()) {
    if (now - session.lastSeen > 45000) {
      session.online = false;
      session.sharing = false;
      session.screenFrame = null;
    }

    if (session.screenAt && now - session.screenAt > 5000) {
      session.screenFrame = null;
    }
  }
}

async function verifyGoogleToken(token) {
  if (!token || !process.env.GOOGLE_CLIENT_ID) return null;

  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (
      data.aud !== process.env.GOOGLE_CLIENT_ID ||
      data.email_verified !== "true" ||
      !data.email
    ) return null;

    return {
      email: data.email.toLowerCase(),
      name: data.name || data.email
    };
  } catch {
    return null;
  }
}

async function getRequestUser(req) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return null;
  return verifyGoogleToken(token);
}

async function requireOwner(req, res, next) {
  const user = await getRequestUser(req);

  if (!user || user.email !== OWNER_EMAIL) {
    return res.status(403).json({
      error: "Acesso exclusivo do dono."
    });
  }

  req.user = user;
  next();
}

function updateSession(sessionId, user) {
  let session = sessions.get(sessionId);

  if (!session) {
    session = {
      id: sessionId,
      email: user?.email || null,
      name: user?.name || "Visitante",
      online: true,
      sharing: false,
      screenFrame: null,
      screenAt: null,
      createdAt: new Date().toISOString()
    };
  }

  if (user) {
    session.email = user.email;
    session.name = user.name;

    users.set(user.email, {
      email: user.email,
      name: user.name,
      lastSeen: new Date().toISOString()
    });
  }

  session.online = true;
  session.lastSeen = Date.now();

  sessions.set(sessionId, session);
  return session;
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// LOGIN GOOGLE
app.post("/api/auth/google", async (req, res) => {
  const user = await verifyGoogleToken(req.body.credential);

  if (!user) {
    return res.status(401).json({
      error: "Login Google inválido."
    });
  }

  if (blockedUsers.has(user.email)) {
    return res.status(403).json({
      error: "Esta conta está bloqueada."
    });
  }

  if (validSessionId(req.body.sessionId)) {
    updateSession(req.body.sessionId, user);
  }

  res.json({
    authenticated: true,
    isOwner: user.email === OWNER_EMAIL,
    email: user.email,
    name: user.name
  });
});

// PRESENÇA
app.post("/api/presence", async (req, res) => {
  cleanOldSessions();

  const { sessionId } = req.body;

  if (!validSessionId(sessionId)) {
    return res.status(400).json({
      error: "Sessão inválida."
    });
  }

  const user = await getRequestUser(req);

  if (user && blockedUsers.has(user.email)) {
    return res.status(403).json({
      error: "Sua conta está bloqueada."
    });
  }

  const existing = sessions.get(sessionId);

  if (existing?.disconnected) {
    return res.status(403).json({
      disconnected: true,
      error: "O dono desconectou sua sessão."
    });
  }

  updateSession(sessionId, user);
  res.json({ success: true });
});

// CONFIGURAÇÕES DO DONO
app.get("/api/admin/settings", requireOwner, (req, res) => {
  res.json(settings);
});

app.post("/api/admin/settings", requireOwner, (req, res) => {
  if (typeof req.body.resenhaEnabled === "boolean") {
    settings.resenhaEnabled = req.body.resenhaEnabled;
  }

  res.json({
    success: true,
    settings
  });
});

// USUÁRIOS E SESSÕES
app.get("/api/admin/users", requireOwner, (req, res) => {
  cleanOldSessions();

  res.json({
    users: [...users.values()].map(user => ({
      ...user,
      blocked: blockedUsers.has(user.email)
    })),

    sessions: [...sessions.values()].map(session => ({
      id: session.id,
      email: session.email,
      name: session.name,
      online: session.online && !session.disconnected,
      sharing: session.sharing,
      lastSeen: session.lastSeen,
      disconnected: !!session.disconnected
    }))
  });
});

// DESCONECTAR SESSÃO
app.post("/api/admin/sessions/disconnect", requireOwner, (req, res) => {
  const { sessionId } = req.body;

  if (!validSessionId(sessionId)) {
    return res.status(400).json({
      error: "Sessão inválida."
    });
  }

  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      error: "Sessão não encontrada."
    });
  }

  session.disconnected = true;
  session.online = false;
  session.sharing = false;
  session.screenFrame = null;

  res.json({ success: true });
});

// BLOQUEAR CONTA
app.post("/api/admin/users/block", requireOwner, (req, res) => {
  const email = String(req.body.email || "").toLowerCase();

  if (!email || email === OWNER_EMAIL) {
    return res.status(400).json({
      error: "Não é possível bloquear essa conta."
    });
  }

  if (req.body.blocked === true) {
    blockedUsers.add(email);

    for (const session of sessions.values()) {
      if (session.email === email) {
        session.disconnected = true;
        session.online = false;
        session.sharing = false;
        session.screenFrame = null;
      }
    }
  } else {
    blockedUsers.delete(email);
  }

  res.json({ success: true });
});

// COMPARTILHAMENTO DE TELA
// O usuário precisa autorizar pelo navegador.
app.post("/api/screen/start", (req, res) => {
  const { sessionId } = req.body;

  if (!validSessionId(sessionId)) {
    return res.status(400).json({
      error: "Sessão inválida."
    });
  }

  const session = sessions.get(sessionId);

  if (!session || session.disconnected) {
    return res.status(403).json({
      error: "Sessão indisponível."
    });
  }

  session.sharing = true;
  session.screenFrame = null;
  session.lastSeen = Date.now();

  res.json({ success: true });
});

app.post("/api/screen/frame", (req, res) => {
  const { sessionId, frame } = req.body;

  if (!validSessionId(sessionId) || typeof frame !== "string") {
    return res.status(400).json({
      error: "Dados inválidos."
    });
  }

  const session = sessions.get(sessionId);

  if (!session || session.disconnected || !session.sharing) {
    return res.status(403).json({
      error: "Compartilhamento não autorizado."
    });
  }

  if (
    !frame.startsWith("data:image/jpeg;base64,") ||
    frame.length > 1500000
  ) {
    return res.status(400).json({
      error: "Imagem inválida ou muito grande."
    });
  }

  session.screenFrame = frame;
  session.screenAt = Date.now();
  session.lastSeen = Date.now();

  res.json({ success: true });
});

// TELAS COMPARTILHADAS
app.get("/api/admin/screens", requireOwner, (req, res) => {
  cleanOldSessions();

  const screens = [...sessions.values()]
    .filter(session =>
      session.online &&
      !session.disconnected &&
      session.sharing &&
      session.screenFrame
    )
    .map(session => ({
      sessionId: session.id,
      name: session.name,
      email: session.email,
      frame: session.screenFrame
    }));

  res.json({ screens });
});

app.post("/api/screen/stop", (req, res) => {
  const { sessionId } = req.body;
  const session = sessions.get(sessionId);

  if (session) {
    session.sharing = false;
    session.screenFrame = null;
    session.screenAt = null;
  }

  res.json({ success: true });
});

// CHAT DA PICA PAU IA
app.post("/api/chat", async (req, res) => {
  try {
    const { message, messages, mode, sessionId } = req.body;

    const user = await getRequestUser(req);

    if (user && blockedUsers.has(user.email)) {
      return res.status(403).json({
        error: "Sua conta está bloqueada."
      });
    }

    if (validSessionId(sessionId)) {
      const session = sessions.get(sessionId);

      if (session?.disconnected) {
        return res.status(403).json({
          disconnected: true,
          error: "O dono desconectou sua sessão."
        });
      }

      updateSession(sessionId, user);
    }

    const conversation = Array.isArray(messages)
      ? messages.slice(-20).filter(item =>
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
        )
      : [{
          role: "user",
          content: String(message || "")
        }];

    if (!conversation.length) {
      return res.status(400).json({
        error: "Envie uma mensagem."
      });
    }

    const resenhaAtiva =
      mode === "resenha" && settings.resenhaEnabled;

    const systemPrompt = `
Você é a Pica Pau IA, uma inteligência artificial inteligente,
versátil, criativa e prestativa.

REGRAS:
- Responda em português brasileiro.
- Ajude com programação, jogos, tecnologia, estudos,
matemática e criatividade.
- Explique de forma clara e completa.
- Não invente informações.
- Se não souber algo, admita.
- Não ensine a assassinar pessoas nem a ocultar crimes.

PERSONALIDADE:
${resenhaAtiva ? `
MODO RESENHA ATIVO:
- Seja engraçado e descontraído.
- Use gírias brasileiras naturalmente.
- Faça brincadeiras leves e amigáveis.
- Nunca humilhe o usuário.
- Não deixe a brincadeira atrapalhar a resposta.
` : `
Use seu estilo normal: inteligente, simpático,
prestativo e direto.
`}
`;

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "A chave GROQ_API_KEY não está configurada."
      });
    }

    const apiResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            ...conversation
          ]
        })
      }
    );

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      return res.status(502).json({
        error: data.error?.message || "Erro ao consultar a IA."
      });
    }

    const answer =
      data.choices?.[0]?.message?.content ||
      "Não consegui gerar uma resposta.";

    res.json({
      answer,
      reply: answer
    });

  } catch (error) {
    console.error("Erro no chat:", error);

    res.status(500).json({
      error: "Erro interno. Tente novamente."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Pica Pau IA rodando na porta ${PORT}`);
});
