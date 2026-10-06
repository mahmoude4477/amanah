export type AmanahDrift = {
  label: string;
  severity: "S0" | "S1" | "S2" | "S3";
  confidence: number;
  source_span?: string | null;
  target_span?: string | null;
  evidence?: string | null;
  origin: "model" | "rule" | "fusion";
};

export type AmanahMLResult = {
  decision: "PASS" | "REVIEW" | "CRITICAL" | "ABSTAIN";
  integrity_score: number;
  severity: "S0" | "S1" | "S2" | "S3";
  confidence: number;
  drifts: AmanahDrift[];
  needs_human_review: boolean;
  model_version: string;
  reference_status: string;
  notes: string[];
};

export async function callAmanahML(endpoint: string, apiToken: string | undefined, payload: { source_type: "quran"; source_ar: string; candidate_en: string; ayah_id?: string }): Promise<AmanahMLResult> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/v1/analyze`, {
    method: "POST",
    headers: {"content-type": "application/json","X-Scale-Up-Timeout": "600",...(apiToken ? { authorization: `Bearer ${apiToken}` } : {})},
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`AMANAH ML request failed: ${response.status}`);
  return (await response.json()) as AmanahMLResult;
}

export async function callAmanahHFEndpoint(endpoint: string, apiToken: string | undefined, payload: { source_type: "quran"; source_ar: string; candidate_en: string; ayah_id?: string }): Promise<AmanahMLResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {"content-type": "application/json",...(apiToken ? { authorization: `Bearer ${apiToken}` } : {})},
    body: JSON.stringify({ inputs: payload }),
  });
  if (!response.ok) throw new Error(`AMANAH HF request failed: ${response.status}`);
  return (await response.json()) as AmanahMLResult;
}

export function buildGroundedExplanationPrompt(ml: AmanahMLResult, sourceAr: string, candidateEn: string): string {
  return [
    "You are the explanation layer for AMANAH.",
    "LLM explanation must not override AMANAH decision, severity, or drift labels.",
    "Explain only the structured findings below. If evidence is insufficient, say human review is required.",
    `Arabic source: ${sourceAr}`,
    `Candidate translation: ${candidateEn}`,
    `Decision: ${ml.decision}`,
    `Severity: ${ml.severity}`,
    `Findings: ${JSON.stringify(ml.drifts)}`,
  ].join("\n");
}

export async function analyzeAndExplain(args: {
  endpoint: string;
  apiToken?: string;
  payload: { source_type: "quran"; source_ar: string; candidate_en: string; ayah_id?: string };
  explainWithLlama: (prompt: string) => Promise<string>;
  transport?: "fastapi" | "hf";
}) {
  let ml: AmanahMLResult;
  try {
    ml = args.transport === "hf"
      ? await callAmanahHFEndpoint(args.endpoint, args.apiToken, args.payload)
      : await callAmanahML(args.endpoint, args.apiToken, args.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      decision: "ABSTAIN" as const,
      severity: "S0" as const,
      drifts: [],
      integrity_score: 0,
      confidence: 0,
      needs_human_review: true,
      model_version: "unavailable",
      reference_status: "unknown",
      notes: [`ML endpoint unavailable: ${message}`],
      explanation: "Human review required because the AMANAH model service is unavailable.",
    };
  }
  const explanation = ml.decision === "ABSTAIN"
    ? "Human review required before any correction suggestion."
    : await args.explainWithLlama(buildGroundedExplanationPrompt(ml, args.payload.source_ar, args.payload.candidate_en));
  return {
    decision: ml.decision,
    severity: ml.severity,
    drifts: ml.drifts,
    integrity_score: ml.integrity_score,
    confidence: ml.confidence,
    needs_human_review: ml.needs_human_review,
    model_version: ml.model_version,
    reference_status: ml.reference_status,
    notes: ml.notes,
    explanation,
  };
}
