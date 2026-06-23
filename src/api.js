/**
 * api.js — MIT Assistant API client
 * Thin wrapper around the FastAPI backend running at localhost:8000
 */

const API_BASE = 'http://localhost:8000';

/**
 * Check backend health.
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
  const res = await fetch(`${API_BASE}/`);
  if (!res.ok) throw new Error(`Status ${res.status}`);
  return true;
}

/**
 * Trigger PDF embedding / ChromaDB ingestion.
 * @returns {Promise<{message: string}>}
 */
export async function embedPDF() {
  const res = await fetch(`${API_BASE}/embed_pdf`);
  if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
  return res.json();
}

/**
 * Research Assistant — uses MCP tools (arXiv, Tavily).
 * @param {string} query
 * @returns {Promise<object>} Raw workflow response
 */
export async function generateResearchSummary(query) {
  const res = await fetch(`${API_BASE}/generate_research_summary/${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`RA request failed: ${res.status}`);
  return res.json();
}

/**
 * Teaching Assistant — uses local RAG + DuckDuckGo.
 * @param {string} query
 * @returns {Promise<object>}
 */
export async function runTAQuery(query) {
  const res = await fetch(`${API_BASE}/run-llm/${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`TA request failed: ${res.status}`);
  return res.json();
}

/**
 * Homework Generator — multi-agent question + answer pipeline.
 * @param {string} query
 * @returns {Promise<object>}
 */
export async function generateHomework(query) {
  const res = await fetch(`${API_BASE}/generate-homework/${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`Homework request failed: ${res.status}`);
  return res.json();
}

/** Map mode keys to their fetch functions */
export const MODE_FETCH = {
  ra: generateResearchSummary,
  ta: runTAQuery,
  hw: generateHomework,
};
