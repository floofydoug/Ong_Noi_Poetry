import Anthropic from "@anthropic-ai/sdk";

// Re-analyze ONE cropped poem with Opus vision (same posture as scripts/transcribe.py).
const client = new Anthropic(); // ANTHROPIC_API_KEY from env

const SYSTEM =
  "You transcribe a single scanned, handwritten Vietnamese poem by the poet Thanh-Phùng " +
  "(dấu huyền on the u; he also signs T.P. or his dharma name Chánh Tuệ Minh). Preserve EXACT " +
  "Vietnamese diacritics and line breaks. Do not translate, modernize, or correct spelling. " +
  "Mark any unreadable character as [?] and list those fragments in uncertain_spans. The image " +
  "is ONE poem (a cropped region) — return exactly one poem.";

const USER_TEXT =
  "Transcribe this handwritten Vietnamese poem. Give `lines`: an ordered array of {vi, en} — `vi` " +
  "is one line of Vietnamese with EXACT diacritics, `en` a faithful English translation of that " +
  "line; an empty {vi:'',en:''} marks a stanza break. Extract any title, date, place, and author " +
  "signature (null if absent). Mark unreadable characters [?] and list them in uncertain_spans.";

const SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title_vi", "title", "date_text", "place", "author", "lines", "confidence", "uncertain_spans"],
  properties: {
    title_vi: { type: ["string", "null"] },
    title: { type: ["string", "null"] },
    date_text: { type: ["string", "null"] },
    place: { type: ["string", "null"] },
    author: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["vi", "en"],
        properties: { vi: { type: "string" }, en: { type: "string" } },
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    uncertain_spans: { type: "array", items: { type: "string" } },
  },
};

export async function analyzeCrop(pngBase64: string) {
  const t0 = Date.now();
  console.log(`[reanalyze] analyzeCrop start — image ${Math.round(pngBase64.length / 1024)}KB (b64)`);
  // Stream: a single dense poem can generate thousands of tokens; a non-streaming request risks
  // proxy/idle timeouts and looks "hung" to the user. Streaming keeps the connection alive and we
  // assemble the final message at the end. (Per the Anthropic SDK long-output guidance.)
  const stream = client.messages.stream({
    model: "claude-opus-4-8",
    max_tokens: 4000,
    system: SYSTEM,
    // structured JSON output (same as the batch pipeline)
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: pngBase64 } },
        { type: "text", text: USER_TEXT },
      ],
    }],
  } as any);
  const msg = await stream.finalMessage();
  const block: any = (msg.content as any[]).find((b) => b.type === "text");
  const poem = JSON.parse(block?.text ?? "{}");
  console.log(`[reanalyze] analyzeCrop done in ${Date.now() - t0}ms — ${msg.usage?.output_tokens} out tokens`);
  return { poem, usage: msg.usage };
}
