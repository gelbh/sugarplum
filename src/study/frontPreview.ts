const PREVIEW_LEN = 120;

/** First ~120 chars of front text/prompt from stored front_json. */
export function frontPreviewFromJson(frontJson: string): string {
  let text = frontJson;
  try {
    const parsed: unknown = JSON.parse(frontJson);
    if (typeof parsed === "string") {
      text = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (typeof obj.text === "string") text = obj.text;
      else if (typeof obj.prompt === "string") text = obj.prompt;
      else text = JSON.stringify(parsed);
    }
  } catch {
    // keep raw string
  }
  return text.slice(0, PREVIEW_LEN);
}
