// api/generate.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    topic,
    brand,
    language = 'en',
    textModel = 'gpt-4o-mini',
    imageModel = 'dall-e-3',
    openaiKey,
    stabilityKey
  } = req.body;

  if (!topic || !brand) return res.status(400).json({ error: 'Missing topic or brand' });

  // API keys: প্রথমে request থেকে, না থাকলে environment variable
  const OPENAI_KEY = openaiKey || process.env.OPENAI_API_KEY;
  const STABILITY_KEY = stabilityKey || process.env.STABILITY_API_KEY;

  const brandStyles = {
    meow: { text: "cute, playful, cat-themed", image: "cute cat illustration, soft pastels" },
    sad: { text: "melancholy, emotional, deep", image: "dark moody, rain, solitude" },
    motivation: { text: "inspirational, uplifting", image: "bright sunrise, achievement" }
  };
  const style = brandStyles[brand.toLowerCase()] || brandStyles.motivation;

  const langInstruction = language === 'bn'
    ? 'Output ONLY in Bengali (Bangla script).'
    : 'Output ONLY in English.';

  // ---------- TEXT PROMPT ----------
  const textPrompt = `Create a Facebook post in ${style.text} tone about: "${topic}". ${langInstruction}
Respond with a JSON object with these fields. Do not include any other text.
{
  "caption": "main caption (2-3 sentences)",
  "quote": "short quote (max 10 words)",
  "hashtags": "5 hashtags with #"
}`;

  let caption = '', quote = '', hashtags = '', textError = null;

  if (OPENAI_KEY) {
    try {
      const textRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: textModel,
          messages: [{ role: 'user', content: textPrompt }],
          temperature: 0.8,
          max_tokens: 500
        })
      });
      const data = await textRes.json();
      if (data.choices?.[0]?.message?.content) {
        const raw = data.choices[0].message.content.trim();
        try {
          const parsed = JSON.parse(raw);
          caption = parsed.caption || '';
          quote = parsed.quote || '';
          hashtags = parsed.hashtags || '';
        } catch {
          // Fallback regex extraction
          caption = (raw.match(/"caption"\s*:\s*"([^"]+)"/) || [])[1] || '';
          quote = (raw.match(/"quote"\s*:\s*"([^"]+)"/) || [])[1] || '';
          hashtags = (raw.match(/"hashtags"\s*:\s*"([^"]+)"/) || [])[1] || '';
        }
      } else {
        textError = 'Text API returned empty content.';
      }
    } catch (e) {
      textError = `Text request failed: ${e.message}`;
    }
  } else {
    textError = 'No OpenAI API key provided.';
  }

  // ---------- IMAGE PROMPT ----------
  const imagePrompt = `A high-quality Facebook post image about "${topic}". Style: ${style.image}. ${
    language === 'bn' ? 'Include Bengali text if suitable.' : ''
  }`;
  let imageUrl = null, imageError = null;

  // Try image models in order (DALL-E if OpenAI key, then Stability if key)
  if (OPENAI_KEY && (imageModel === 'dall-e-3' || imageModel === 'dall-e-2')) {
    try {
      const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: imageModel,
          prompt: imagePrompt,
          n: 1,
          size: '1024x1024'
        })
      });
      const imgData = await imgRes.json();
      if (imgData.data?.[0]?.url) {
        imageUrl = imgData.data[0].url;
      } else {
        imageError = imgData.error?.message || 'DALL-E did not return a URL.';
      }
    } catch (e) {
      imageError = `DALL-E request failed: ${e.message}`;
    }
  } else if (STABILITY_KEY && (imageModel === 'stable-diffusion-xl' || imageModel === 'stable-diffusion')) {
    try {
      const imgRes = await fetch('https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${STABILITY_KEY}`
        },
        body: JSON.stringify({
          text_prompts: [{ text: imagePrompt }],
          cfg_scale: 7,
          height: 1024,
          width: 1024,
          samples: 1
        })
      });
      const imgData = await imgRes.json();
      if (imgData.artifacts?.[0]?.base64) {
        imageUrl = `data:image/png;base64,${imgData.artifacts[0].base64}`;
      } else {
        imageError = imgData.message || 'Stability AI did not return an image.';
      }
    } catch (e) {
      imageError = `Stability API request failed: ${e.message}`;
    }
  } else {
    imageError = 'No valid image API key or model specified.';
  }

  // Fallback to a default image if all fail? (we won't, just report)
  return res.status(200).json({
    caption,
    quote,
    hashtags,
    imageUrl,
    errors: { text: textError, image: imageError }
  });
    }
