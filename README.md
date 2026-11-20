# Exus IA

Requisitos: Node.js 18+ e uma chave de API OpenAI com faturamento configurado.

1. Extraia o ZIP e abra a pasta no terminal.
2. Rode `npm install`.
3. Copie `.env.example` para `.env` e coloque sua chave em `OPENAI_API_KEY`.
4. Rode `npm start` e abra `http://localhost:3000`.

A chave fica no servidor; nunca coloque-a no JavaScript público. O chat mantém o histórico apenas durante a sessão. Nenhuma IA garante resposta correta para absolutamente tudo.
