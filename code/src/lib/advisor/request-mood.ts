import "server-only";
import { generateText, Output } from "ai";
import { getModel } from "@/lib/ai/models";
import { REQUEST_MOODS, type RequestMood } from "./mood";

const INSTRUCTIONS = `You set the facial expression of Clara, the digital pension advisor, while she reads the customer's latest message. Pick the one that fits the customer's tone:
- happy: good news or joy (a birth, a wedding, a new job, looking forward to retirement)
- empathetic: worry, fear, loss, illness, death, separation, job loss, money trouble or frustration
- curious: a question or something Clara needs to know more about
- neutral: plain facts or anything else
Never pick happy when the message mentions illness, accident, disability or death, even alongside good news.`;

/** Clara's face while she thinks about the customer's message; neutral when that is unclear. */
export async function requestMood(message: string): Promise<RequestMood> {
  const { output } = await generateText({
    model: getModel("analysis"),
    instructions: INSTRUCTIONS,
    prompt: message.slice(0, 2000),
    output: Output.choice({ options: [...REQUEST_MOODS], name: "clara_mood" }),
    maxRetries: 1,
    abortSignal: AbortSignal.timeout(10_000),
  });
  return output;
}
