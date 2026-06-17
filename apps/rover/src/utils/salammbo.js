import { calculateBearing, calculateDistanceKm } from "./geo";

// Consts

const salammboModel = "Llama-3.2-3B-Instruct-q4f16_1-MLC";
const requiredMaxStorageBuffersPerShaderStage = 10;
const salammboStatuses = Object.freeze({
    idle: "idle",
    loading: "loading",
    ready: "ready",
    error: "error",
    processing: "processing",
    deleting: "deleting",
});
const maxIntelContextItems = 24;
const maxDescriptionLen = 120;
const minQuestionTokenLength = 3;
const stopWords = new Set([
    "about", "after", "again", "area", "are", "around", "ask", "can", "current", "does", "find", "from", "has", "have", "here", "intel", "into", "list", "loaded", "near", "nearby", "point", "points", "show", "tell", "that", "the", "their", "there", "these", "this", "what", "when", "where", "which", "with",
]);

let enginePromise = null;

// Functions

const salammboUnsupportedError = (message) => {
    const error = new Error(message);
    error.salammboUnsupported = true;
    return error;
};

const assertSalammboWebGpuSupport = async () => {
    if (!navigator.gpu) {
        throw salammboUnsupportedError("Salammbo needs WebGPU, which this browser does not currently expose.");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw salammboUnsupportedError("Salammbo needs WebGPU, but this browser could not provide a GPU adapter.");
    }

    const maxStorageBuffers = adapter.limits?.maxStorageBuffersPerShaderStage ?? 0;
    if (maxStorageBuffers < requiredMaxStorageBuffersPerShaderStage) {
        throw salammboUnsupportedError(`Salammbo is not supported on this browser or device yet. WebGPU allows ${maxStorageBuffers} storage buffers per shader stage, but the local LLM runtime needs ${requiredMaxStorageBuffersPerShaderStage}.`);
    }
};

const bearingToCardinal = (bearing) => {
    const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return directions[Math.round(bearing / 45) % directions.length];
};

const truncate = (value, maxLen) => {
    const text = `${value ?? ""}`.trim().replace(/\s+/g, " ");
    if (text.length <= maxLen) return text;
    return `${text.slice(0, maxLen - 3)}...`;
};

const questionTokens = (question) => {
    return new Set(`${question ?? ""}`
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((token) => token.length >= minQuestionTokenLength && !stopWords.has(token)));
};

const pointSearchText = (point) => {
    return `${point.description ?? ""} ${(point.tags ?? []).join(" ")}`.toLowerCase();
};

const relevantIntelPoints = (question, intelPoints, position) => {
    const tokens = questionTokens(question);
    const sorted = sortIntelPoints(intelPoints, position);
    if (tokens.size === 0) return sorted.slice(0, maxIntelContextItems);
    const scored = sorted.map((point, index) => {
        const text = pointSearchText(point);
        let score = 0;
        tokens.forEach((token) => {
            if (text.includes(token)) score += 1;
        });
        return { point, index, score };
    });
    const matches = scored
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map((item) => item.point);
    return (matches.length > 0 ? matches : sorted).slice(0, maxIntelContextItems);
};

const formatTimestamp = (timestamp) => {
    if (!timestamp) return "unknown time";
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "unknown time";
    return date.toISOString();
};

const formatDistance = (position, point) => {
    const coords = position?.coords;
    if (!coords) return "distance unknown";
    const distanceKm = calculateDistanceKm(coords.latitude, coords.longitude, point.latitude, point.longitude);
    const bearing = calculateBearing(coords.latitude, coords.longitude, point.latitude, point.longitude);
    if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m ${bearingToCardinal(bearing)}`;
    return `${distanceKm.toFixed(1)} km ${bearingToCardinal(bearing)}`;
};

const pointKind = (point) => {
    if (point.planned) return "planned note";
    if (point.confirmed) return "saved intel";
    return "unsaved intel";
};

const sortIntelPoints = (intelPoints, position) => {
    const coords = position?.coords;
    if (!coords) return [...intelPoints].sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return [...intelPoints].sort((a, b) => (
        calculateDistanceKm(coords.latitude, coords.longitude, a.latitude, a.longitude) -
        calculateDistanceKm(coords.latitude, coords.longitude, b.latitude, b.longitude)
    ));
};

const buildIntelContext = (question, intelPoints, position) => {
    const sorted = relevantIntelPoints(question, intelPoints, position);
    if (sorted.length === 0) return "No intel points are currently loaded in the browser.";
    return sorted.map((point, index) => {
        const tags = (point.tags ?? []).length > 0 ? point.tags.join(", ") : "none";
        const description = truncate(point.description || "(no description)", maxDescriptionLen);
        const image = point.hasImage || point.b64image ? "yes" : "no";
        return [
            `#${index + 1}`,
            `kind: ${pointKind(point)}`,
            `distance: ${formatDistance(position, point)}`,
            `time: ${formatTimestamp(point.timestamp)}`,
            `tags: ${tags}`,
            `photo: ${image}`,
            `description: ${description}`,
        ].join(" | ");
    }).join("\n");
};

const loadSalammboEngine = async (onProgress) => {
    if (!enginePromise) {
        enginePromise = assertSalammboWebGpuSupport()
            .then(() => import("@mlc-ai/web-llm"))
            .then(({ CreateMLCEngine }) => CreateMLCEngine(salammboModel, {
                initProgressCallback: onProgress,
                logLevel: "WARN",
            }))
            .catch((error) => {
                enginePromise = null;
                throw error;
            });
    }
    return enginePromise;
};

const deleteSalammboModel = async () => {
    const existingEnginePromise = enginePromise;
    enginePromise = null;
    const { deleteModelAllInfoInCache } = await import("@mlc-ai/web-llm");
    if (existingEnginePromise) {
        try {
            const engine = await existingEnginePromise;
            await engine.unload();
        } catch (error) {
            console.warn("failed to unload Salammbo before cache delete:", error);
        }
    }
    await deleteModelAllInfoInCache(salammboModel);
};

const formatShortPoint = (point, index, position) => {
    const tags = (point.tags ?? []).length > 0 ? ` [${point.tags.join(", ")}]` : "";
    const description = truncate(point.description || "(no description)", 80);
    return `#${index + 1}: ${description}${tags} (${formatDistance(position, point)})`;
};

const uniqueTags = (intelPoints) => {
    const tags = new Set();
    intelPoints.forEach((point) => (point.tags ?? []).forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort((a, b) => a.localeCompare(b));
};

const deterministicAnswer = (question, intelPoints, position) => {
    const trimmedQuestion = `${question ?? ""}`.trim().toLowerCase();
    if (intelPoints.length === 0) {
        return "No loaded intel is available in this map area. Move or zoom the map to an area with loaded points, then ask again.";
    }
    if (/\b(how many|count|number of)\b/.test(trimmedQuestion)) {
        return `Loaded intel in this map area: ${intelPoints.length} point${intelPoints.length === 1 ? "" : "s"}.`;
    }
    if (/\b(tags?|labels?)\b/.test(trimmedQuestion)) {
        const tags = uniqueTags(intelPoints);
        return tags.length > 0
            ? `Tags on loaded intel in this map area: ${tags.join(", ")}.`
            : "Loaded intel in this map area has no tags.";
    }
    if (/\b(recent|latest|newest)\b/.test(trimmedQuestion)) {
        const latest = [...intelPoints]
            .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
            .slice(0, 5);
        return `Most recent loaded intel:\n${latest.map((point, index) => formatShortPoint(point, index, position)).join("\n")}`;
    }
    if (/\b(nearest|closest)\b/.test(trimmedQuestion)) {
        const nearest = sortIntelPoints(intelPoints, position).slice(0, 5);
        return `Nearest loaded intel:\n${nearest.map((point, index) => formatShortPoint(point, index, position)).join("\n")}`;
    }
    if (/\b(summary|summarize|overview)\b/.test(trimmedQuestion)) {
        const tags = uniqueTags(intelPoints);
        const recent = [...intelPoints]
            .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
            .slice(0, 3);
        return [
            `Loaded intel in this map area: ${intelPoints.length} point${intelPoints.length === 1 ? "" : "s"}.`,
            tags.length > 0 ? `Tags: ${tags.join(", ")}.` : "Tags: none.",
            `Recent points:\n${recent.map((point, index) => formatShortPoint(point, index, position)).join("\n")}`,
        ].join("\n");
    }
    return null;
};

const askSalammbo = async ({ question, intelPoints, position, onProgress }) => {
    const localAnswer = deterministicAnswer(question, intelPoints, position);
    if (localAnswer) return localAnswer;
    const engine = await loadSalammboEngine(onProgress);
    const context = buildIntelContext(question, intelPoints, position);
    const reply = await engine.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are Salammbo, a strict local intel summarizer for OpenIntel. Answer only from the loaded intel context supplied by the browser. Do not use outside knowledge. Do not infer facts that are not explicit in the context. If the context does not answer the question, say: \"I cannot answer that from the loaded intel.\" Every factual answer must mention the intel number(s) used, such as #1 or #2.",
            },
            {
                role: "user",
                content: `Loaded intel evidence:\n${context}\n\nQuestion: ${question}\n\nReturn a concise answer. Include a final line starting with "Used intel:" and list the evidence numbers, or "Used intel: none" if the evidence is insufficient.`,
            },
        ],
        temperature: 0,
        max_tokens: 350,
    });
    return reply?.choices?.[0]?.message?.content?.trim() || "Salammbo did not return a response.";
};

export { askSalammbo, deleteSalammboModel, loadSalammboEngine, salammboModel, salammboStatuses };
