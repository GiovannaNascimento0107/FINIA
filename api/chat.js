export default async function handler(req, res) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY, // A Vercel vai pegar a chave que você salvou lá
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-3-sonnet-20240229", // Versão atualizada e estável
      max_tokens: 800,
      system: req.body.system,
      messages: req.body.messages,
    }),
  });

  const data = await response.json();
  res.status(200).json(data);
}