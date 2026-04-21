export type Topic = "M&A" | "LBO" | "Valuation";

export type AssessResponse = {
  workspace: {
    label: string;
    confidence: number;
    class_index: number;
  };
  technical: {
    expertise_level: number;
    expertise_label: string;
    level_confidence: number;
    topic: string;
    skills_identified: string[];
    concepts_missed: string[];
    summary: string;
  };
  fit: {
    fit_score: number;
    environment_component: number;
    technical_component: number;
    weights: Record<string, number>;
  };
  narrative: string;
};

export type MockInterviewResponse = AssessResponse & {
  transcript: string;
  behavioral: {
    score: number;
    star_coverage: Record<string, boolean>;
    filler_words: Record<string, number>;
    filler_total: number;
    word_count: number;
    speaking_rate_wpm: number | null;
    has_numbers: boolean;
    feedback: string[];
  };
};
