/**
 * Sprint-0 Lane-B spike: confirm LOCAL embeddings work with no API key.
 *
 * Unlike scripts/spike-ai.ts (which calls the hosted Hugging Face API), this
 * runs the model *in-process* via @xenova/transformers — pure JavaScript, no
 * Python, no key, no per-call network. The first run downloads the model
 * (~90 MB) into a local cache; every run after that is offline.
 *
 * Throwaway diagnostic — safe to delete after it passes.
 *
 *   npx tsx backend/scripts/embed.ts
 *
 * Success = it prints a vector length of 384.
 */
import { pipeline } from "@xenova/transformers";

const MODEL = "Xenova/all-MiniLM-L6-v2";
const SENTENCE = "Afrobeats rooftop party in Accra this weekend";

(async () => {
  console.log(`Loading ${MODEL} …`);
  console.log("(first run downloads ~90 MB — one time — then it's cached)\n");

  // feature-extraction = "turn text into an embedding vector"
  const embed = await pipeline("feature-extraction", MODEL);

  // pooling:'mean' + normalize:true = the standard sentence-embedding recipe
  const output = await embed(SENTENCE, { pooling: "mean", normalize: true });

  const vector = Array.from(output.data as Float32Array);

  console.log(`sentence: "${SENTENCE}"`);
  console.log(`vector length: ${vector.length}   (expected 384)`);
  console.log(`first 4 values: [${vector.slice(0, 4).map((n) => n.toFixed(4)).join(", ")} …]`);
  console.log(vector.length === 384 ? "\n✓ SUCCESS — local embeddings work." : "\n✗ unexpected dimension");
})();
