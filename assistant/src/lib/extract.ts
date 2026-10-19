import { extractText, getDocumentProxy } from "unpdf";

export interface Extracted {
  text: string;
  pages?: number;
}

// Extract plain text from an uploaded file. PDF via unpdf; plain text/markdown/csv decoded directly. Stays fully local.
export async function extractFromFile(name: string, type: string, bytes: ArrayBuffer): Promise<Extracted> {
  const lower = name.toLowerCase();
  if (type === "application/pdf" || lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text, totalPages } = await extractText(pdf, { mergePages: true });
    const merged = Array.isArray(text) ? text.join("\n") : text;
    return { text: merged.trim(), pages: totalPages };
  }
  if (
    type.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv") ||
    lower.endsWith(".json")
  ) {
    return { text: new TextDecoder().decode(bytes).trim() };
  }
  throw new Error(`Unsupported file type "${type || name}". Use PDF, TXT, MD, CSV, or JSON (Word support coming).`);
}
