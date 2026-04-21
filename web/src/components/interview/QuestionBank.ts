export type InterviewTrack = "behavioral" | "technical";

export type InterviewQuestion = {
  id: string;
  track: InterviewTrack;
  title: string;
  prompt: string;
  suggestedSeconds: number;
  topicHint?: "M&A" | "LBO" | "Valuation";
};

export const QUESTION_BANK: InterviewQuestion[] = [
  {
    id: "behav-tell-me",
    track: "behavioral",
    title: "Tell me about yourself",
    prompt:
      "Give a 60–90 second overview: who you are, what you’ve done, why finance, and why you’re a strong fit for this role.",
    suggestedSeconds: 90,
  },
  {
    id: "behav-leadership",
    track: "behavioral",
    title: "Leadership example",
    prompt:
      "Describe a time you led a team through ambiguity. What was the situation, what did you do, and what was the outcome?",
    suggestedSeconds: 120,
  },
  {
    id: "behav-why-ib",
    track: "behavioral",
    title: "Why investment banking?",
    prompt:
      "Why this firm, why banking, and why now? Connect your background to the role in 60–90 seconds.",
    suggestedSeconds: 90,
  },
  {
    id: "behav-conflict",
    track: "behavioral",
    title: "Conflict on a team",
    prompt:
      "Tell me about a time you disagreed with a teammate or stakeholder. How did you handle it and what was the result?",
    suggestedSeconds: 120,
  },
  {
    id: "behav-strength-weak",
    track: "behavioral",
    title: "Strengths and weaknesses",
    prompt:
      "What is a real strength you bring to a deal team—and a weakness you’re actively improving? Give brief examples.",
    suggestedSeconds: 90,
  },
  {
    id: "tech-valuation",
    track: "technical",
    title: "Valuation: DCF overview",
    prompt:
      "Walk me through a DCF. What drives value, how do you calculate WACC, and how do you treat terminal value?",
    suggestedSeconds: 150,
    topicHint: "Valuation",
  },
  {
    id: "tech-lbo",
    track: "technical",
    title: "LBO: returns drivers",
    prompt:
      "Explain what drives sponsor returns in an LBO (IRR/MOIC). Talk leverage, deleveraging, entry/exit multiples, and cash flow.",
    suggestedSeconds: 150,
    topicHint: "LBO",
  },
  {
    id: "tech-ma",
    track: "technical",
    title: "M&A: accretion/dilution",
    prompt:
      "How do you think about accretion/dilution in an M&A deal? Mention purchase consideration, synergies, and pro forma impact.",
    suggestedSeconds: 150,
    topicHint: "M&A",
  },
  {
    id: "tech-ev-bridge",
    track: "technical",
    title: "Valuation: EV to equity bridge",
    prompt:
      "Walk from enterprise value to equity value. What bridges do you walk through and what items matter most?",
    suggestedSeconds: 150,
    topicHint: "Valuation",
  },
  {
    id: "tech-capm-wacc",
    track: "technical",
    title: "Valuation: cost of equity & CAPM",
    prompt:
      "How do you think about cost of equity in a CAPM framework? What inputs move the needle for WACC in practice?",
    suggestedSeconds: 150,
    topicHint: "Valuation",
  },
  {
    id: "tech-paper-lbo",
    track: "technical",
    title: "LBO: paper LBO",
    prompt:
      "Sketch a simple paper LBO: sources of return, leverage effect, and what you’d sanity-check on entry vs exit.",
    suggestedSeconds: 150,
    topicHint: "LBO",
  },
  {
    id: "tech-comps",
    track: "technical",
    title: "Valuation: trading comps",
    prompt:
      "How would you build trading comps for a public target? Discuss multiples choice, adjustments, and common pitfalls.",
    suggestedSeconds: 150,
    topicHint: "Valuation",
  },
];

/** Superday: randomized behavioral block first, then randomized technical block. */
export const SUPERDAY_BEHAVIORAL_COUNT = 2;
export const SUPERDAY_TECHNICAL_COUNT = 3;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Build a Superday question list: all behavioral questions (shuffled) up to SUPERDAY_BEHAVIORAL_COUNT,
 * then technical (shuffled) up to SUPERDAY_TECHNICAL_COUNT. Behavioral always comes first.
 */
export function buildSuperdaySession(rng: () => number = Math.random): InterviewQuestion[] {
  const behavioral = QUESTION_BANK.filter((q) => q.track === "behavioral");
  const technical = QUESTION_BANK.filter((q) => q.track === "technical");
  const beh = shuffle(behavioral, rng).slice(0, SUPERDAY_BEHAVIORAL_COUNT);
  const tech = shuffle(technical, rng).slice(0, SUPERDAY_TECHNICAL_COUNT);
  return [...beh, ...tech];
}

