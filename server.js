import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(dir, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.static(publicDir));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "Chave da API não configurada."
      });
    }

    const messages = Array.isArray(req.body.messages)
      ? req.body.messages
      : typeof req.body.message === "string"
        ? [{ role: "user", content: req.body.message }]
        : [];

    const input = messages
      .filter(m =>
        ["user", "assistant"].includes(m.role) &&
        typeof m.content === "string"
      )
      .slice(-20)
      .map(m => ({
        role: m.role,
        content: m.content
      }));

    if (!input.length) {
      return res.status(400).json({
        error: "Digite uma mensagem."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
          instructions: "Você é a Exus IA, um assistente prestativo, direto e claro. Responda em português quando o usuário escrever em português. Se não souber, explique honestamente.",
          input
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || "Erro na API."
      });
    }

    const answer = (data.output || [])
      .flatMap(item => item.content || [])
      .filter(item => item.type === "output_text")
      .map(item => item.text)
      .join("\n");

    res.json({
      answer,
      reply: answer
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: "Erro interno. Tente novamente."
    });
  }
});

app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Exus IA está online!");
});
