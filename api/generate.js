export default async function handler(req, res) {
  const { topic } = req.body;

  const prompt = `
Create a viral Facebook post.

Topic: ${topic}

Give:
- Caption
- Short quote for image
- 10 hashtags
`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }]
    })
  });

  const data = await response.json();

  res.status(200).json({
    text: data.choices[0].message.content
  });
}
