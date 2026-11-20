import express from "express"; import dotenv from "dotenv"; import path from "path"; import {fileURLToPath} from "url";
dotenv.config(); const app=express(); const dir=path.dirname(fileURLToPath(import.meta.url));
app.use(express.json({limit:"1mb"})); app.use(express.static(path.join(dir,"public")));
app.post("/api/chat",async(req,res)=>{try{
if(!process.env.OPENAI_API_KEY)return res.status(500).json({error:"Configure OPENAI_API_KEY no arquivo .env."});
const messages=(Array.isArray(req.body.messages)?req.body.messages:[]).filter(m=>["user","assistant"].includes(m.role)&&typeof m.content==="string").slice(-20);
const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${process.env.OPENAI_API_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-4.1-mini",instructions:"Você é Exus IA, um assistente prestativo, direto e claro. Responda em português quando o usuário escrever em português. Se não souber ou não tiver certeza, explique honestamente. Nunca invente fatos.",input:messages.map(m=>({role:m.role,content:[{type:"input_text",text:m.content}]}))})});
const d=await r.json(); if(!r.ok)return res.status(r.status).json({error:d?.error?.message||"Erro na API."});
const answer=(d.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==="output_text").map(x=>x.text).join("\n").trim();
res.json({answer:answer||"Não consegui montar uma resposta. Tente reformular."});
}catch(e){res.status(500).json({error:"Falha de conexão. Verifique a internet e tente novamente."});}});
app.listen(Number(process.env.PORT||3000),()=>console.log("Exus IA em http://localhost:3000"));