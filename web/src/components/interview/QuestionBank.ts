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
];

