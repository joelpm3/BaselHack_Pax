/**
 * A small OpenAI-compatible chat completions server for the browser tests. The app runs with
 * LLM_PROVIDER=openai-compatible against it, one model id per role (see playwright.config.ts):
 *
 * - `e2e-chat` replays the persona scripts in e2e/personas, streaming text and tool calls the way
 *   the AI SDK expects them. The script is found by the first customer message, the turn by the
 *   number of customer messages, the step by the assistant messages since the last one.
 * - every other model (background analysis, titles, Clara's mood) gets a harmless canned answer.
 *
 * Stateless: everything it needs is in the request, so a test can reload or retry freely.
 *   tsx e2e/servers/llm-mock.ts            (port from E2E_LLM_PORT, default 3241)
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { PERSONAS } from "../personas";
import type { PersonaScript, Step, StepContext } from "../personas/script";

const PORT = Number(process.env.E2E_LLM_PORT ?? 3241);
export const CHAT_MODEL = "e2e-chat";
/** The engine's reply nudge is a user-side note, not a customer message (see reply-nudge.ts). */
const NUDGE = "[Note from the chat system";

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | Array<{ type: string; text?: string }> | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  response_format?: { type: string };
}

interface Reply {
  text: string;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}

function textOf(message: ChatMessage): string {
  if (typeof message.content === "string") return message.content;
  return (message.content ?? []).map((part) => part.text ?? "").join("\n");
}

function contextOf(messages: ChatMessage[]): StepContext {
  const toolNames = new Map<string, string>();
  for (const m of messages)
    for (const call of m.tool_calls ?? []) toolNames.set(call.id, call.function.name);
  return {
    outputs: (tool) =>
      messages
        .filter((m) => m.role === "tool" && toolNames.get(m.tool_call_id ?? "") === tool)
        .map((m) => {
          try {
            return JSON.parse(textOf(m));
          } catch {
            return textOf(m);
          }
        }),
  };
}

function scriptedReply(messages: ChatMessage[]): Reply {
  const customer = messages
    .map((m, index) => ({ m, index }))
    .filter(({ m }) => m.role === "user" && !textOf(m).startsWith(NUDGE));
  const first = customer[0] ? textOf(customer[0].m) : "";
  const persona: PersonaScript | undefined = PERSONAS.find((p) => p.opening.test(first));
  if (!persona) return say(`[e2e mock] No persona script starts with: ${first.slice(0, 80)}`);

  const last = customer.at(-1);
  const turnIndex = customer.length - 1;
  const lastText = last ? textOf(last.m) : "";
  const turn = persona.turns[turnIndex];
  if (!turn || !turn.user.test(lastText))
    return say(`[e2e mock] ${persona.id}: turn ${turnIndex + 1} does not expect: ${lastText}`);

  const stepIndex = messages
    .slice((last?.index ?? 0) + 1)
    .filter((m) => m.role === "assistant").length;
  const step: Step | undefined = turn.steps[stepIndex];
  // The engine may ask for one more step (e.g. after a reply nudge): end the turn quietly.
  if (!step) return { text: "", toolCalls: [] };

  console.log(`[e2e mock] ${persona.id} turn ${turnIndex + 1} step ${stepIndex + 1}`);
  const ctx = contextOf(messages);
  const text = typeof step.text === "function" ? step.text(ctx) : (step.text ?? "");
  const toolCalls = (step.tools ?? []).map((call, i) => ({
    id: `call_${persona.id}_${turnIndex + 1}_${stepIndex + 1}_${i + 1}`,
    name: call.name,
    arguments: JSON.stringify(typeof call.args === "function" ? call.args(ctx) : call.args),
  }));
  return { text, toolCalls };
}

const say = (text: string): Reply => ({ text, toolCalls: [] });

/** Canned answers for the background calls, recognised by their instructions. */
const CANNED: Array<{ when: string; answer: unknown }> = [
  { when: "facial expression of Clara", answer: { result: "neutral" } },
  {
    when: "conversation analyst of Pax",
    answer: {
      title: "Vorsorgeberatung",
      summary: "Testgespräch der automatischen Browser-Tests.",
      topics: [],
      lifeEvents: [],
      productInterest: [],
      intentStage: "exploring",
      sentiment: "neutral",
      painPoints: [],
      gaps: [],
      triggeredRuleIds: [],
      handover: { required: false, reason: null, urgency: "normal" },
      serviceRequest: null,
      externalPolicy: null,
      reasonToCall: "Kein Anlass: Testgespräch.",
      talkingPoints: [],
      nextBestAction: null,
    },
  },
  { when: "frequently asked customer questions", answer: { questions: [] } },
  { when: "Extract future life events", answer: { events: [] } },
  {
    when: "short notes for a customer's insurance cockpit",
    answer: {
      title: "Ein Punkt zum Prüfen",
      body: "In Ihrer Vorsorge gibt es einen Punkt, den wir gemeinsam anschauen können.",
    },
  },
];

function cannedReply(request: ChatRequest): Reply {
  const system = request.messages
    .filter((m) => m.role === "system")
    .map(textOf)
    .join("\n");
  const match = CANNED.find((c) => system.includes(c.when));
  if (match) return say(JSON.stringify(match.answer));
  if (request.response_format?.type?.startsWith("json")) return say("{}");
  return say("Vorsorgeberatung");
}

function completion(model: string, reply: Reply) {
  return {
    id: `chatcmpl-e2e-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: reply.text || null,
          ...(reply.toolCalls.length
            ? {
                tool_calls: reply.toolCalls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: c.arguments },
                })),
              }
            : {}),
        },
        finish_reason: reply.toolCalls.length ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}

/** Streams the reply as chunks: text in small pieces, then each tool call whole. */
function streamReply(res: ServerResponse, model: string, reply: Reply) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const id = `chatcmpl-e2e-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: Record<string, unknown>, finish: string | null = null, usage?: object) =>
    res.write(
      `data: ${JSON.stringify({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finish }],
        ...(usage ? { usage } : {}),
      })}\n\n`,
    );
  chunk({ role: "assistant", content: "" });
  for (const piece of reply.text.match(/[\s\S]{1,40}/g) ?? []) chunk({ content: piece });
  for (const [index, call] of reply.toolCalls.entries()) {
    chunk({
      tool_calls: [
        {
          index,
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        },
      ],
    });
  }
  chunk({}, reply.toolCalls.length ? "tool_calls" : "stop", {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  });
  res.write("data: [DONE]\n\n");
  res.end();
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    return;
  }
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }
  try {
    const request = JSON.parse(await body(req)) as ChatRequest;
    const reply =
      request.model === CHAT_MODEL ? scriptedReply(request.messages) : cannedReply(request);
    if (reply.text.startsWith("[e2e mock]")) console.error(reply.text);
    if (request.stream) streamReply(res, request.model, reply);
    else
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end(JSON.stringify(completion(request.model, reply)));
  } catch (error) {
    console.error("[e2e mock] request failed", error);
    res
      .writeHead(500, { "Content-Type": "application/json" })
      .end(JSON.stringify({ error: { message: String(error) } }));
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`[e2e] mock LLM on :${PORT}`));
