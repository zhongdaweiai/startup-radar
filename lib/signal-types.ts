export type StorySignalType = "company" | "industry" | "event";

export type ExtractedStorySignal = {
  type: StorySignalType;
  label: string;
  slug: string;
  confidence: number;
  evidence: string | null;
};
