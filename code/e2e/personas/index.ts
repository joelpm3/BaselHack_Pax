import { janeScript } from "./jane";
import { lilyScript } from "./lily";
import { mayScript } from "./may";
import type { PersonaScript } from "./script";
import { taylorScript } from "./taylor";
import { wilsonScript } from "./wilson";

/** The five official challenge personas (documentation/challenge_context/MATERIAL.md). */
export const PERSONAS: PersonaScript[] = [
  janeScript,
  mayScript,
  lilyScript,
  wilsonScript,
  taylorScript,
];
