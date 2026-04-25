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
    coverage?: Record<string, boolean> | null;
    explained?: Record<string, boolean> | null;
    coverage_score?: number | null;
    /** Among rubric dimensions touched, share with causal language nearby (0–100). */
    explanation_score?: number | null;
  };
  fit: {
    fit_score: number;
    environment_component: number;
    technical_component: number;
    weights: Record<string, number>;
    /** Transcript tone + vocal prosody composite when enabled. */
    delivery_component?: number | null;
  };
  narrative: string;
};

export type MockInterviewResponse = AssessResponse & {
  question_id?: string | null;
  question_track?: string | null;
  transcript: string;
  timings_ms?: Record<string, number> | null;
  analysis_meta?: Record<string, number | boolean | string> | null;
  recommendations?: string[] | null;
  warnings?: string[] | null;
  behavioral: {
    score: number;
    star_coverage: Record<string, boolean>;
    question_template?: string | null;
    question_coverage?: Record<string, boolean> | null;
    question_outline?: string[] | null;
    top_fixes?: string[] | null;
    filler_words: Record<string, number>;
    filler_total: number;
    word_count: number;
    speaking_rate_wpm: number | null;
    has_numbers: boolean;
    filler_per_100?: number | null;
    has_time_or_scale?: boolean | null;
    has_outcome_number?: boolean | null;
    star_hits?: number | null;
    hedge_hits?: number | null;
    subscores?: Record<string, number> | null;
    feedback: string[];
  };
  sentiment?: {
    tone: string;
    dominant_emotion?: string | null;
    emotion_scores?: Record<string, number> | null;
    note?: string | null;
  } | null;
  prosody?: {
    label: string;
    words_per_minute?: number | null;
    pause_fraction?: number | null;
    pitch_std_hz?: number | null;
    rms_cv?: number | null;
    note?: string | null;
  } | null;
  gaze?: {
    status: string;
    pattern?: string | null;
    confidence?: number | null;
    frames_used?: number | null;
    warning?: string | null;
  } | null;
};

export type SessionCreateResponse = {
  id: string;
  topic: string;
  questions: unknown[];
  status: string;
  created_at: string;
};
