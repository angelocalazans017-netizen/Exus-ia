
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));

const OWNER_EMAIL = "angelocalazans017@gmail.com";

// Configurações em memória
let settings = {
  resenhaEnabled: true
};

const users = new Map();
const blockedUsers = new Set();

async function verifyGoogleToken(token) {
  if (!token) return null;

  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
  );

  if (!response.ok) return null;

  const user = await response.json();

  if (
    user.aud !== process.env.GOOGLE_CLIENT_ID ||
    user.email_verified !== "true"
  ) {
    return null;
  }

  return {
    email: user.email.toLowerCase(),
    name: user.name || user.email
  };
}

async function requireOwner(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    const user = await verifyGoogleToken(token);

    if (!user || user.email !== OWNER_EMAIL) {
      return res.status(403).json({ error: "Acesso exclusivo do dono." });
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Não foi possível verificar sua conta." });
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// LOGIN GOOGLE
app.post("/api/auth/google", async (req, res) => {
  try {
    const user = await verifyGoogleToken(req.body.credential);

    if (!user) {
      return res.status(401).json({ error: "Login Google inválido." });
    }

    if (blockedUsers.has(user.email)) {
      return res.status(403).json({ error: "Esta conta está bloqueada." });
    }

    users.set(user.email, {
      email: user.email,
      name: user.name,
      lastSeen: new Date().toISOString()
    });

    res.json({
      authenticated: true,
      isOwner: user.email === OWNER_EMAIL,
      email: user.email,
      name: user.name
    });
  } catch {
    res.status(500).json({ error: "Erro ao verificar login." });
  }
});

// CONFIGURAÇÕES DO PAINEL DO DONO
app.get("/api/admin/settings", requireOwner, (req, res) => {
  res.json(settings);
});

app.post("/api/admin/settings", requireOwner, (req, res) => {
  if (typeof req.body.resenhaEnabled === "boolean") {
    settings.resenhaEnabled = req.body.resenhaEnabled;
  }

  res.json({ success: true, settings });
});

// USUÁRIOS QUE ENTRARAM COM GOOGLE
app.get("/api/admin/users", requireOwner, (req, res) => {
  res.json({
    users: [...users.values()].map(user => ({
      ...user,
      blocked: blockedUsers.has(user.email)
    }))
  });
});

app.post("/api/admin/users/block", requireOwner, (req, res) => {
  const email = String(req.body.email || "").toLowerCase();

  if (!email || email === OWNER_EMAIL) {
    return res.status(400).json({ error: "Não é possível bloquear essa conta." });
  }

  if (req.body.blocked === true) {
    blockedUsers.add(email);
  } else {
    blockedUsers.delete(email);
  }

  res.json({ success: true });
});

// CHAT DA EXUS IA
app.post("/api/chat", async (req, res) => {
  try {
    const { message, messages, mode } = req.body;

    const token = req.headers.authorization?.replace("Bearer ", "");
    if (token) {
      const user = await verifyGoogleToken(token);

      if (!user) {
        return res.status(401).json({ error: "Faça login novamente." });
      }

      if (blockedUsers.has(user.email)) {
        return res.status(403).json({ error: "Sua conta está bloqueada." });
      }

      users.set(user.email, {
        email: user.email,
        name: user.name,
        lastSeen: new Date().toISOString()
      });
    }

    const conversation = Array.isArray(messages)
      ? messages.slice(-20).filter(item =>
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
        )
      : [{ role: "user", content: String(message || "") }];

    if (!conversation.length) {
      return res.status(400).json({ error: "Envie uma mensagem." });
    }

    const resenhaAtiva = mode === "resenha" && settings.resenhaEnabled;

    const systemPrompt = `
Você é a EXUS IA, uma inteligência artificial inteligente, versátil e prestativa.

REGRAS:
- Responda em português brasileiro.
- Responda perguntas sobre praticamente qualquer assunto.
- Ajude com programação, jogos, tecnologia, estudos, matemática, criatividade e conhecimentos gerais.
- Explique de forma clara e completa.
- Não invente informações.
- Se não souber algo, admita.
- Na identidade fictícia da EXUS IA, seu criador é Daleste.
- Não ensine a assassinar pessoas nem a ocultar corpos ou encobrir crimes.

MODO DE PERSONALIDADE:
${resenhaAtiva ? `
O MODO RESENHA ESTÁ ATIVO.
- Seja engraçado, descontraído e cheio de personalidade.
- Use gírias brasileiras naturalmente.
- Pode zoar o usuário de forma leve e amigável, como amigos brincando.
- Use expressões como "farmando aura", "meteu essa?", "amassou", "calma, cria" quando combinarem.
- Faça brincadeiras e provocações sem humilhar ou atacar características pessoais.
- Pode comentar tendências e assuntos atuais quando tiver informações confiáveis.
- NÃO deixe a brincadeira atrapalhar a resposta.
- Responda a pergunta de verdade, com explicações úteis.
- Não invente notícias nem acontecimentos do momento.
` : `
Use seu estilo normal: inteligente, simpático, prestativo e direto.
`}`;

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
            { role: "system", content: systemPrompt },
            ...conversation
          ]
        })
      }
    );

    const data = await apiResponse.json();

    if (!apiResponse.ok) {
      return res.status(apiResponse.status).json({
        error: data.error?.message || "Erro ao consultar a IA."
      });
    }

    const answer =
      data.choices?.[0]?.message?.content ||
      "Não consegui gerar uma resposta.";

    res.json({ answer, reply: answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro interno. Tente novamente." });
  }
});

app.listen(PORT, () => {
  console.log(`EXUS IA rodando na porta ${PORT}`);
});
    
