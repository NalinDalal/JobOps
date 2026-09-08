/**
 * lib/ai.mjs — Cloudflare Workers AI helper
 */

import { getCfCredentials } from './env.mjs';

export async function cfAI(
  prompt,
  {
    system = 'You are a helpful assistant. Return raw JSON, no markdown.',
    maxTokens = 2048,
    temperature = 0.3,
  } = {},
) {
  const { token, account, model } = getCfCredentials();
  if (!token || !account) {
    throw new Error(
      'Cloudflare credentials not configured. Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env',
    );
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/ai/run/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: prompt },
        ],
        stream: false,
        max_tokens: maxTokens,
        temperature,
      }),
    },
  );
  const data = await res.json();
  return data.result?.choices?.[0]?.message?.content || data.result?.response || '';
}

export function parseJSON(raw, fallback = null) {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/g, '')
      .trim();
    const match = cleaned.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (!match) return fallback;
    return JSON.parse(match[1]);
  } catch {
    return fallback;
  }
}
