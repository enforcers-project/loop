/**
 * Sprint-0 Lane-B spike: confirm the Groq (LLM) and Hugging Face (embeddings)
 * keys actually work. Throwaway diagnostic — safe to delete after it passes.
 *
 *   npx tsx backend/scripts/spike-ai.ts
 *
 * Reads keys from backend/.env (no dependency on dotenv — parsed inline).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

// --- tiny .env reader (avoids adding a dep for a throwaway script) ---
function loadEnv(): Record<string, string> {
  const path = join(HERE, "..", ".env");
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const env = loadEnv();
const GROQ_API_KEY = env.GROQ_API_KEY;
const HF_API_TOKEN = env.HF_API_TOKEN;

const EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2";
const GROQ_MODEL = "llama-3.1-8b-instant";

async function testGroq() {
  console.log("\n=== Groq (LLM) ===");
  if (!GROQ_API_KEY) return console.log("  ✗ GROQ_API_KEY missing in .env");
  console.log(`  key: ${GROQ_API_KEY.slice(0, 7)}… model: ${GROQ_MODEL}`);
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: "Reply with exactly: LOOP_OK" }],
        max_tokens: 10,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      console.log(`  ✗ HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    const json = await res.json();
    console.log(`  ✓ reply: ${JSON.stringify(json.choices?.[0]?.message?.content)}`);
    return true;
  } catch (e) {
    console.log(`  ✗ request failed: ${(e as Error).message}`);
    return false;
  }
}

async function testHF() {
  console.log("\n=== Hugging Face (embeddings) ===");
  if (!HF_API_TOKEN) return console.log("  ✗ HF_API_TOKEN missing in .env");
  console.log(`  token: ${HF_API_TOKEN.slice(0, 6)}… model: ${EMBED_MODEL}`);
  try {
    // Note: HF migrated off api-inference.huggingface.co → router.huggingface.co
    // (the old host no longer resolves DNS). This is the current path (2026).
    const res = await fetch(
      `https://router.huggingface.co/hf-inference/models/${EMBED_MODEL}/pipeline/feature-extraction`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${HF_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: "Afrobeats rooftop party in Accra this weekend",
        }),
      },
    );
    if (!res.ok) {
      console.log(`  ✗ HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    const vec = (await res.json()) as number[];
    const dim = Array.isArray(vec) ? vec.length : -1;
    console.log(`  ✓ got vector, dim = ${dim}  (expected 384)`);
    console.log(`  first 4: [${vec.slice(0, 4).map((n) => n.toFixed(4)).join(", ")} …]`);
    if (dim !== 384) console.log(`  ⚠ dim ${dim} ≠ 384 — the pinned DIM would need to change!`);
    return dim === 384;
  } catch (e) {
    console.log(`  ✗ request failed: ${(e as Error).message}`);
    return false;
  }
}

(async () => {
  const groq = await testGroq();
  const hf = await testHF();
  console.log("\n=== SUMMARY ===");
  console.log(`  Groq LLM:        ${groq ? "✓ working" : "✗ FAILED"}`);
  console.log(`  HF embeddings:   ${hf ? "✓ working (384-d)" : "✗ FAILED"}`);
})();
