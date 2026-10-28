/**
 * Optional AI assistant. Runs only on the server so the API key never reaches
 * the browser. Enabled by setting ANTHROPIC_API_KEY in `.env`.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';
import { z } from 'zod';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  client ??= new Anthropic();
  return client;
}

export function aiStatus() {
  return { enabled: Boolean(process.env.ANTHROPIC_API_KEY), model: MODEL };
}

const chatRequest = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
  /** Plain-text snapshot of the user's dashboard, built by the browser. */
  context: z.string().max(80_000),
  today: z.string().max(80),
});

const SYSTEM_PROMPT = `You are the built-in assistant of "Vyro", a personal dashboard the user runs for school, side businesses, habits, goals, tasks and notes.

You receive a snapshot of the user's current data. Use it to:
- summarize what is on their plate,
- plan their day realistically (respect fixed events, estimate durations when missing, leave buffers),
- suggest priorities, weighing due dates, importance and, for school work, grade impact,
- run weekly reviews and spot things slipping (overdue items, broken streaks, stalled projects).

Ground every claim in the snapshot. Refer to items by their exact titles so the user can find them. If the data needed to answer is missing, say what is missing instead of inventing it. You cannot modify their data — tell them what to change and where.

Keep answers tight and scannable: short headings or bullet lists, times in the user's local format, no filler. Default to under 250 words unless asked for more.`;

export async function aiChat(req: Request, res: Response) {
  const anthropic = getClient();
  if (!anthropic) {
    res.status(503).json({ error: 'AI is not configured. Add ANTHROPIC_API_KEY to .env and restart the server.' });
    return;
  }
  const parsed = chatRequest.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.issues.slice(0, 5) });
    return;
  }
  const { messages, context, today } = parsed.data;
  if (messages[0].role !== 'user') {
    res.status(400).json({ error: 'Conversation must start with a user message.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  const send = (payload: object) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  const abort = new AbortController();
  res.on('close', () => abort.abort());

  try {
    const stream = anthropic.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        // Re-run on Anthropic's recommended fallback model if a safety classifier declines.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: `Today is ${today}.\n\n<dashboard_snapshot>\n${context}\n</dashboard_snapshot>` },
        ],
        messages,
      },
      { signal: abort.signal },
    );

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send({ type: 'text', text: event.delta.text });
      }
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      send({ type: 'error', message: 'The assistant declined this request. Try rephrasing it.' });
    } else if (final.stop_reason === 'max_tokens') {
      send({ type: 'notice', message: 'Response was cut off at the length limit.' });
    }
    send({ type: 'done' });
  } catch (err) {
    if (abort.signal.aborted) return;
    let message = 'The assistant request failed.';
    if (err instanceof Anthropic.AuthenticationError) message = 'The ANTHROPIC_API_KEY was rejected. Check the key in .env.';
    else if (err instanceof Anthropic.RateLimitError) message = 'Rate limited by the AI provider — try again in a minute.';
    else if (err instanceof Anthropic.BadRequestError) message = `The AI provider rejected the request: ${err.message}`;
    else if (err instanceof Anthropic.APIError) message = `AI provider error (${err.status ?? 'network'}). Try again shortly.`;
    console.error('[ai]', err);
    send({ type: 'error', message });
  } finally {
    res.end();
  }
}
