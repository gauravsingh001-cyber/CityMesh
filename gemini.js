/**
 * gemini.js
 * -----------------------------------------------------------------------
 * This module is the "Cognitive Layer" of the project.
 *
 * If a GEMINI_API_KEY is present in the environment, it calls the real
 * Google Gemini API to parse a free-text shopping list into structured
 * {item, category} pairs.
 *
 * If no API key is set, it automatically falls back to a local
 * keyword-based parser so the whole project still runs and can be demoed
 * WITHOUT needing an API key or internet access.
 * -----------------------------------------------------------------------
 */

const CATEGORY_KEYWORDS = {
  Medical: ["syrup", "tablet", "paracetamol", "crocin", "bandage", "dettol", "medicine", "medical", "koflet"],
  Stationery: ["notebook", "pen", "pencil", "geometry box", "graph paper", "eraser", "stationery", "copy", "register"],
  Grocery: ["milk", "bread", "eggs", "rice", "sugar", "grocery", "amul", "atta", "oil", "salt"],
  Hardware: ["screwdriver", "nails", "tape", "hardware", "wire", "bulb", "wrench"]
};

function guessCategory(itemName) {
  const lower = itemName.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) {
      return category;
    }
  }
  return "General";
}

/**
 * Local fallback parser — splits on commas / "and" / newlines and
 * guesses a category for each item using keyword matching.
 */
function fallbackParse(text) {
  const rawItems = text
    .split(/,|\band\b|\n/gi)
    .map((s) => s.trim())
    .filter(Boolean);

  return rawItems.map((item) => ({
    item: item.toLowerCase(),
    category: guessCategory(item)
  }));
}

/**
 * Calls the real Gemini API (if GEMINI_API_KEY is set) to parse the
 * shopping list into structured JSON. Falls back to local parsing on
 * any error or if no key is configured.
 */
async function parseShoppingList(text) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { source: "fallback", items: fallbackParse(text) };
  }

  try {
    const prompt = `You are a shopping list parser for a hyper-local commerce app.
Extract each item from the user's shopping list below and classify it into ONE of these categories:
Medical, Stationery, Grocery, Hardware, General.

Respond ONLY with a valid JSON array, no markdown, no explanation, in this exact format:
[{"item": "item name in lowercase", "category": "Category"}]

Shopping list: "${text}"`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API returned status ${response.status}`);
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return { source: "gemini", items: parsed };
  } catch (err) {
    console.error("[gemini.js] Falling back to local parser due to error:", err.message);
    return { source: "fallback", items: fallbackParse(text) };
  }
}

module.exports = { parseShoppingList, guessCategory };
