
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "A chave da Groq não foi configurada no Render."
      });
    }

    let messages = req.body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      if (!req.body.message) {
        return res.status(400).json({
          error: "Digite uma mensagem."
        });
      }

      messages = [
        { role: "user", content: req.body.message }
      ];
    }

    messages = messages
      .filter(m =>
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      )
      .slice(-20);

    messages.unshift({
      role: "system",
      content: "Você é a Exus IA, uma assistente inteligente, simpática e prestativa. Responda em português brasileiro, com clareza e naturalidade."
    });

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages,
          temperature: 0.7,
          max_completion_tokens: 2048
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Erro Groq:", data);
      return res.status(response.status).json({
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
    console.error("Erro no servidor:", error);
    res.status(500).json({
      error: "Erro interno. Tente novamente."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Exus IA rodando na porta ${PORT}`);
});
