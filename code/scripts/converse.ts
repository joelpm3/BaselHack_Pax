/**
 * Loops example conversations against the real advisor (prompt, tools, Logismata) and writes
 * readable transcripts with tool calls, quick replies, the profile after each turn and
 * heuristic flags. Used to tune the advisor; see scripts/converse-log.md for the findings.
 *
 *   pnpm converse <id|all> [more ids]      (tsx + scripts/server-only-stub.cjs, see package.json)
 *     --parallel=3   scenarios at once (default 3)
 *     --out=DIR      output directory (default data/converse/<timestamp>)
 *     --list         list the scenarios
 *
 * Uses the database in DATA_DIR (default ./data): run it against a seeded dev DB, never the
 * live one. Simulated customers are flagged `isSimulated`; the background classifier is off.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateText, Output, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createConversation } from "@/lib/advisor/conversations";
import { quickRepliesOf } from "@/lib/advisor/quick-replies";
import { runAdvisorTurn } from "@/lib/advisor/turn";
import { getModel } from "@/lib/ai/models";
import { db, schema } from "@/lib/db";
import { lifeSituationSchema, profileCompleteness } from "@/lib/domain/profile";
import { messageItems } from "@/lib/insights/transcript";
import { getProfile } from "@/lib/profile/service";
import { asksAboutInsurance, explainsOptions, flagsFor, type ToolCall } from "./converse-checks";
import { type Beat, SCENARIOS, type Scenario, scenarioById } from "./converse-scenarios";

// Opus ignores `temperature`; the SDK would warn on every step.
(globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;
// The classifier would run after every turn and cost a model call each; not needed here.
(globalThis as { paxAnalyze?: (id: string) => Promise<void> }).paxAnalyze = async () => {};

const customerTurn = z.object({
  action: z.enum(["continue", "end"]).describe("end: you are done, this is your goodbye"),
  message: z.string().describe("Your next chat message"),
});

const LANGUAGE = {
  de: "Swiss German-speaker writing German",
  fr: "French",
  it: "Italian",
  en: "English",
};

function createCustomer(scenario: Scenario): string {
  return db.transaction((tx) => {
    const demo = scenario.demoClient
      ? tx
          .select()
          .from(schema.customers)
          .where(
            and(
              eq(schema.customers.isDemo, true),
              eq(schema.customers.firstName, scenario.demoClient),
            ),
          )
          .get()
      : undefined;
    if (scenario.demoClient && !demo) throw new Error(`Demo client ${scenario.demoClient} missing`);
    const customer = tx
      .insert(schema.customers)
      .values({
        lifecycle: demo ? "client" : "anonymous",
        locale: scenario.locale,
        isSimulated: true,
        ...(demo
          ? {
              firstName: demo.firstName,
              lastName: demo.lastName,
              email: demo.email,
              birthDate: demo.birthDate,
            }
          : {}),
      })
      .returning()
      .get();
    let profile = lifeSituationSchema.parse(scenario.knownProfile ?? {});
    if (demo) {
      const row = tx
        .select()
        .from(schema.profiles)
        .where(eq(schema.profiles.customerId, demo.id))
        .get();
      if (row) profile = lifeSituationSchema.parse(row.data);
      const policies = tx
        .select()
        .from(schema.policies)
        .where(eq(schema.policies.customerId, demo.id))
        .all();
      if (policies.length)
        tx.insert(schema.policies)
          .values(
            policies.map(({ id: _id, createdAt: _c, updatedAt: _u, ...p }) => ({
              ...p,
              customerId: customer.id,
            })),
          )
          .run();
    }
    tx.insert(schema.profiles)
      .values({
        customerId: customer.id,
        data: profile,
        completeness: profileCompleteness(profile),
      })
      .run();
    return customer.id;
  });
}

interface Exchange {
  customer: string;
  voice: boolean;
  texts: string[];
  tools: ToolCall[];
  quickReplies: string[];
  profile: unknown;
  flags: string[];
  ms: number;
}

function toolsOf(message: UIMessage): { texts: string[]; tools: ToolCall[] } {
  const texts: string[] = [];
  const tools: ToolCall[] = [];
  for (const item of messageItems(message.parts)) {
    if (item.kind === "text") texts.push(item.text);
    if (item.kind === "tool")
      tools.push({
        name: item.tool.name,
        input: item.tool.input,
        output: item.tool.output,
        error: item.tool.errorText,
      });
  }
  return { texts, tools };
}

/** The profile without empty branches, for a compact print. */
function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? value : undefined;
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([k, v]) => [k, compact(v)] as const)
      .filter(([, v]) => v !== undefined);
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return value;
}

async function simulatedMessage(
  scenario: Scenario,
  history: Array<{ role: "customer" | "advisor"; text: string }>,
  quickReplies: string[],
  intent: string | null,
): Promise<{ text: string; end: boolean }> {
  const { output } = await generateText({
    model: getModel("simulation"),
    instructions: `You role-play a private customer chatting with Clara, the digital pension advisor of Pax, a Swiss life insurer. Stay in character; never write like an assistant, no lists.
## Who you are
${scenario.persona}
## Rules
- Write only as a ${LANGUAGE[scenario.locale]}.
- Reveal facts when asked or when it comes up naturally; you may volunteer one extra fact now and then.
- You do not know exact pension-fund figures and have no documents at hand.
- If one of the quick-reply buttons says exactly what you want to answer, reply with that button text verbatim (you tapped it).
- End (action end) once you have a clear answer or next step, or when the advisor asks for feedback.`,
    prompt: [
      "Conversation so far:",
      ...history.map((t) => `${t.role === "customer" ? "YOU" : "ADVISOR"}: ${t.text}`),
      quickReplies.length
        ? `Quick-reply buttons shown: ${quickReplies.map((q) => `«${q}»`).join(" ")}`
        : "",
      intent ? `For this message: ${intent}` : "Write your next message.",
    ]
      .filter(Boolean)
      .join("\n"),
    output: Output.object({ schema: customerTurn, name: "customer_turn" }),
    maxRetries: 2,
  });
  return { text: output.message.trim(), end: output.action === "end" };
}

function beatOf(beat: Beat | undefined): {
  say: string | null;
  intent: string | null;
  voice: boolean;
} {
  if (beat === undefined) return { say: null, intent: null, voice: false };
  if (typeof beat === "string") return { say: beat, intent: null, voice: false };
  if ("say" in beat) return { say: beat.say, intent: null, voice: beat.voice ?? false };
  return { say: null, intent: beat.intent, voice: beat.voice ?? false };
}

const INFORMAL = /\b(du|dir|dich|dein\w*|tu|toi|ton|ta|tes|ti|tuo|tua)\b/i;

async function runScenario(scenario: Scenario): Promise<{ markdown: string; flags: number }> {
  const customerId = createCustomer(scenario);
  const conversation = await createConversation({
    customerId,
    locale: scenario.locale,
    mode: scenario.demoClient ? "existing_customer" : "new_business",
    isSimulated: true,
  });
  const greeting = db
    .select({ parts: schema.messages.parts })
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversation.id))
    .get();
  const greetingText = toolsOf({
    id: "g",
    role: "assistant",
    parts: greeting?.parts ?? [],
  } as UIMessage).texts.join(" ");
  const history: Array<{ role: "customer" | "advisor"; text: string }> = [
    { role: "advisor", text: greetingText },
  ];
  const exchanges: Exchange[] = [];
  let quickReplies: string[] = [];
  let informal = false;
  let analysisShown = false;
  let insuranceAsked = false;
  let optionsExplained = false;

  for (let i = 0; i < scenario.maxTurns; i++) {
    const beat = beatOf(scenario.script[i]);
    let text = beat.say;
    let end = false;
    if (!text) {
      const sim = await simulatedMessage(scenario, history, quickReplies, beat.intent);
      text = sim.text;
      end = sim.end;
    }
    if (!text) break;
    informal ||= INFORMAL.test(text);
    history.push({ role: "customer", text });
    const started = Date.now();
    let reply: UIMessage;
    try {
      reply = await runAdvisorTurn({
        conversationId: conversation.id,
        userMessage: {
          id: crypto.randomUUID(),
          role: "user",
          parts: [{ type: "text", text }],
          ...(beat.voice ? { metadata: { inputMode: "voice" } } : {}),
        } as UIMessage,
      });
    } catch (error) {
      exchanges.push({
        customer: text,
        voice: beat.voice,
        texts: [],
        tools: [],
        quickReplies: [],
        profile: null,
        flags: [`TURN_FAILED: ${error instanceof Error ? error.message : String(error)}`],
        ms: Date.now() - started,
      });
      break;
    }
    const { texts, tools } = toolsOf(reply);
    // What the chat shows.
    quickReplies = quickRepliesOf(reply.parts as Array<{ type: string }>);
    analysisShown ||= tools.some((t) =>
      ["showRiskAnalysis", "showPensionOverview"].includes(t.name),
    );
    // Only text written before a recommendation counts as explaining the options first.
    const items = messageItems(reply.parts);
    const recommendAt = items.findIndex(
      (i) => i.kind === "tool" && i.tool.name === "recommendProducts",
    );
    const explainedBefore =
      optionsExplained ||
      items
        .slice(0, Math.max(0, recommendAt))
        .some((i) => i.kind === "text" && explainsOptions(i.text));
    const flags = flagsFor({
      customer: text,
      texts,
      tools,
      quickReplies,
      customerUsesInformal: informal,
      analysisShown,
      insuranceAsked,
      optionsExplained: explainedBefore,
    });
    optionsExplained ||= texts.some(explainsOptions);
    insuranceAsked ||= texts.some(asksAboutInsurance);
    exchanges.push({
      customer: text,
      voice: beat.voice,
      texts,
      tools,
      quickReplies,
      profile: compact(getProfile(customerId)),
      flags,
      ms: Date.now() - started,
    });
    history.push({ role: "advisor", text: texts.join("\n") });
    if (end) break;
  }

  const policies = db
    .select()
    .from(schema.policies)
    .where(eq(schema.policies.customerId, customerId))
    .all()
    .map(
      (p) =>
        `${p.insurer} ${p.productName} (${p.category}, ${p.insuredPerson ?? "?"}, sum ${p.sumInsured ?? "-"}, annuity ${p.annuityAnnual ?? "-"}, source ${p.source})`,
    );
  const lines = [
    `# ${scenario.id}: ${scenario.title}`,
    "",
    `Conversation ${conversation.id}, locale ${scenario.locale}, ${new Date().toISOString()}`,
    "",
    `> ADVISOR (greeting): ${greetingText}`,
    "",
  ];
  let flagCount = 0;
  exchanges.forEach((x, n) => {
    lines.push(`## Turn ${n + 1} (${(x.ms / 1000).toFixed(1)} s)`, "");
    lines.push(`**CUSTOMER${x.voice ? " (voice)" : ""}:** ${x.customer}`, "");
    for (const tool of x.tools) {
      if (tool.name === "suggestReplies") {
        lines.push(`- tool \`suggestReplies\` ${JSON.stringify(tool.input)}`);
        continue;
      }
      const out = JSON.stringify(tool.output ?? null);
      lines.push(
        `- tool \`${tool.name}\` in: \`${JSON.stringify(tool.input)}\` → ${tool.error ? `ERROR ${tool.error}` : `\`${out.length > 600 ? `${out.slice(0, 600)}…` : out}\``}`,
      );
    }
    if (x.tools.length) lines.push("");
    lines.push(`**ADVISOR:** ${x.texts.join("\n\n") || "(no text)"}`, "");
    if (x.quickReplies.length)
      lines.push(`Quick replies: ${x.quickReplies.map((q) => `[${q}]`).join(" ")}`, "");
    lines.push(
      `<details><summary>profile</summary>\n\n\`${JSON.stringify(x.profile)}\`\n\n</details>`,
      "",
    );
    if (x.flags.length) {
      flagCount += x.flags.length;
      lines.push(...x.flags.map((f) => `> FLAG ${f}`), "");
    }
  });
  lines.push(
    "## Policies at the end",
    "",
    ...(policies.length ? policies.map((p) => `- ${p}`) : ["none"]),
  );
  return { markdown: lines.join("\n"), flags: flagCount };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const s of SCENARIOS) console.log(`${s.id.padEnd(22)} ${s.title}`);
    return;
  }
  const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const ids = args.filter((a) => !a.startsWith("--"));
  const selected =
    ids.length === 0 || ids.includes("all")
      ? SCENARIOS
      : ids.map((id) => {
          const s = scenarioById(id);
          if (!s) throw new Error(`Unknown scenario ${id} (try --list)`);
          return s;
        });
  const out =
    option("out") ?? path.join("data", "converse", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(out, { recursive: true });
  const parallel = Number(option("parallel") ?? 3);
  const queue = [...selected];
  const summary: string[] = [];
  const worker = async () => {
    while (queue.length) {
      const scenario = queue.shift() as Scenario;
      const started = Date.now();
      try {
        const { markdown, flags } = await runScenario(scenario);
        writeFileSync(path.join(out, `${scenario.id}.md`), markdown);
        const line = `${scenario.id}: ${flags} flags, ${((Date.now() - started) / 1000).toFixed(0)} s`;
        summary.push(line);
        console.log(line);
      } catch (error) {
        const line = `${scenario.id}: FAILED ${error instanceof Error ? error.stack : String(error)}`;
        summary.push(line);
        console.error(line);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(parallel, selected.length) }, worker));
  console.log(`\nTranscripts in ${out}`);
  process.exit(0);
}

void main();
