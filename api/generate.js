// api/generate.js
export default async function handler(req, res) {
  // CORS headers – adjust if needed
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { topic, brand } = req.body;
  if (!topic || !brand) {
    return res.status(400).json({ error: 'Missing topic or brand' });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // ---------- 1. Prepare prompts based on brand ----------
  const brandStyles = {
    meow: {
      textStyle: "cute, playful, cat-themed",
      imageStyle: "a cute cat illustration or photo, soft pastel colors, whimsical"
    },
    sad: {
      textStyle: "melancholy, emotional, deep",
      imageStyle: "dark moody photography, rain, solitude, cinematic"
    },
    motivation: {
      textStyle: "inspirational, uplifting, energetic",
      imageStyle: "bright sunrise, mountain summit, vibrant colors, achievement"
    }
  };

  const style = brandStyles[brand.toLowerCase()] || brandStyles.motivation;

  // Text prompt – generate structured JSON
  const textPrompt = `Create a Facebook post in ${style.textStyle} tone about: "${topic}".
Respond ONLY with a valid JSON object containing exactly these three fields:
{
  "caption": "the main caption (2-3 sentences)",
  "quote": "a short motivational/philosophical quote suitable for image overlay (max 10 words)",
  "hashtags": "5 relevant hashtags separated by spaces, include #"
}`;

  // Image prompt
  const imagePrompt = `Create a social media image about "${topic}". Style: ${style.imageStyle}. High quality, suitable for Facebook post.`;

  // ---------- 2. Call both APIs in parallel (with error isolation) ----------
  const [textResult, imageResult] = await Promise.allSettled([
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',          // reliable, fast, cost-effective
        messages: [{ role: 'user', content: textPrompt }],
        temperature: 0.8,
        max_tokens: 500
      })
    }),
    fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-image-1',          // as requested
        prompt: imagePrompt,
        n: 1,
        size: '1024x1024'
      })
    })
  ]);

  // ---------- 3. Parse text response ----------
  let caption = '', quote = '', hashtags = '';
  let textError = null;

  if (textResult.status === 'fulfilled') {
    const textRes = await textResult.value.json();
    if (textRes.choices && textRes.choices[0]?.message?.content) {
      try {
        const parsed = JSON.parse(textRes.choices[0].message.content);
        caption = parsed.caption || '';
        quote = parsed.quote || '';
        hashtags = parsed.hashtags || '';
      } catch (e) {
        textError = 'Failed to parse AI text response.';
      }
    } else {
      textError = 'No text content from AI.';
    }
  } else {
    textError = `Text generation failed: ${textResult.reason}`;
  }

  // ---------- 4. Parse image response ----------
  let imageUrl = null;
  let imageError = null;

  if (imageResult.status === 'fulfilled') {
    const imgRes = await imageResult.value.json();
    if (imgRes.data && imgRes.data[0]?.url) {
      imageUrl = imgRes.data[0].url;
    } else {
      imageError = 'AI did not return an image URL.';
    }
  } else {
    imageError = `Image generation failed: ${imageResult.reason}`;
  }

  // ---------- 5. Return unified response ----------
  return res.status(200).json({
    caption,
    quote,
    hashtags,
    imageUrl,
    errors: {
      text: textError,
      image: imageError
    }
  });
}
