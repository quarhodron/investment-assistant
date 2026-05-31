const VALID_PROVIDERS = ["anthropic", "openai"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

export function validateApiKeyInput(
  provider: unknown,
  key: unknown,
): { ok: true; value: { provider: Provider; key: string } } | { ok: false; error: string } {
  if (!VALID_PROVIDERS.includes(provider as Provider)) {
    return { ok: false, error: "invalid_provider" };
  }
  if (typeof key !== "string") {
    return { ok: false, error: "api_key_required" };
  }
  const trimmed = key.trim();
  if (trimmed !== key) {
    return { ok: false, error: "api_key_no_whitespace" };
  }
  if (key.length < 1 || key.length > 256) {
    return { ok: false, error: "api_key_length" };
  }
  return { ok: true, value: { provider: provider as Provider, key } };
}

export function validateRunInput(body: unknown):
  | {
      ok: true;
      value: {
        provider: Provider;
        model_id: string;
        prompt_id?: string;
        prompt_body: string;
        prompt_name: string;
        prompt_description?: string;
        input: string;
        extra_context?: string;
        analysis_type: string;
        subject?: string;
        parent_analysis_id?: string;
        company_id?: string;
        title: string;
      };
    }
  | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_body" };
  }
  const b = body as Record<string, unknown>;

  if (!VALID_PROVIDERS.includes(b.provider as Provider)) {
    return { ok: false, error: "invalid_provider" };
  }
  if (typeof b.model_id !== "string" || b.model_id.length === 0) {
    return { ok: false, error: "model_id_required" };
  }
  if (typeof b.prompt_body !== "string" || b.prompt_body.length === 0) {
    return { ok: false, error: "prompt_body_required" };
  }
  if (typeof b.prompt_name !== "string" || b.prompt_name.length === 0) {
    return { ok: false, error: "prompt_name_required" };
  }
  if (typeof b.input !== "string" || b.input.length === 0) {
    return { ok: false, error: "input_required" };
  }
  if (typeof b.title !== "string" || b.title.length === 0) {
    return { ok: false, error: "title_required" };
  }
  const validAnalysisTypes = ["other", "company"];
  if (!validAnalysisTypes.includes(b.analysis_type as string)) {
    return { ok: false, error: "invalid_analysis_type" };
  }

  return {
    ok: true,
    value: {
      provider: b.provider as Provider,
      model_id: b.model_id,
      prompt_id: typeof b.prompt_id === "string" ? b.prompt_id : undefined,
      prompt_body: b.prompt_body,
      prompt_name: b.prompt_name,
      prompt_description: typeof b.prompt_description === "string" ? b.prompt_description : undefined,
      input: b.input,
      extra_context: typeof b.extra_context === "string" ? b.extra_context : undefined,
      analysis_type: b.analysis_type as string,
      subject: typeof b.subject === "string" ? b.subject : undefined,
      parent_analysis_id: typeof b.parent_analysis_id === "string" ? b.parent_analysis_id : undefined,
      company_id: typeof b.company_id === "string" ? b.company_id : undefined,
      title: b.title,
    },
  };
}
