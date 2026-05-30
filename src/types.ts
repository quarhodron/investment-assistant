import type { Database } from "@/db/database.types";

export type Prompt = Database["public"]["Tables"]["prompts"]["Row"];
export type PromptInsert = Database["public"]["Tables"]["prompts"]["Insert"];
export type PromptUpdate = Database["public"]["Tables"]["prompts"]["Update"];

export type Analysis = Database["public"]["Tables"]["analyses"]["Row"];
export type AnalysisInsert = Database["public"]["Tables"]["analyses"]["Insert"];
// No AnalysisUpdate — analyses are immutable (FR-020)

export type WatchedCompany = Database["public"]["Tables"]["watched_companies"]["Row"];
export type WatchedCompanyInsert = Database["public"]["Tables"]["watched_companies"]["Insert"];
export type WatchedCompanyUpdate = Database["public"]["Tables"]["watched_companies"]["Update"];

export type UserSettings = Database["public"]["Tables"]["user_settings"]["Row"];
export type UserSettingsInsert = Database["public"]["Tables"]["user_settings"]["Insert"];
export type UserSettingsUpdate = Database["public"]["Tables"]["user_settings"]["Update"];

export type AiModel = Database["public"]["Tables"]["ai_models"]["Row"];
export type AiModelInsert = Database["public"]["Tables"]["ai_models"]["Insert"];
export type AiModelUpdate = Database["public"]["Tables"]["ai_models"]["Update"];
