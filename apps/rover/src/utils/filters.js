import { validTokenPattern } from "./validation";

// Consts

const secretTag = "secret";
const filterOperatorAnd = "AND";
const filterOperatorOr = "OR";
const chipTypeToken = "token";
const chipTypeOperator = "operator";
const chipTypeInvalid = "invalid";
const operatorAndText = "and";
const operatorOrText = "or";

// Functions

const classifyChip = (text) => {
    const lower = text.toLowerCase();
    if (lower === operatorAndText || lower === operatorOrText) return chipTypeOperator;
    if (validTokenPattern.test(text)) return chipTypeToken;
    return chipTypeInvalid;
};

const chipsToFilter = (chips) => {
    let operator = filterOperatorAnd;
    const tokens = [];
    for (const chip of chips) {
        if (chip.type === chipTypeOperator) {
            if (chip.text.toLowerCase() === operatorOrText) operator = filterOperatorOr;
        } else if (chip.type === chipTypeToken) {
            tokens.push(chip.text);
        }
    }
    return { tokens, operator };
};

const parseFilterText = (text) => {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return { tokens: [], operator: filterOperatorAnd };
    if (/ and /i.test(trimmed)) {
        return {
            tokens: trimmed.split(/ and /i).map((t) => t.trim()).filter(Boolean),
            operator: filterOperatorAnd,
        };
    }
    if (/ or /i.test(trimmed)) {
        return {
            tokens: trimmed.split(/ or /i).map((t) => t.trim()).filter(Boolean),
            operator: filterOperatorOr,
        };
    }
    return { tokens: [trimmed], operator: filterOperatorAnd };
};

const tokenMatchesPoint = (token, point) => {
    const needle = token.toLowerCase();
    const haystack = `${point.description ?? ""} ${(point.tags ?? []).join(" ")}`.toLowerCase();
    return haystack.includes(needle);
};

const filterIncludesSecretToken = (parsedFilter) =>
    parsedFilter.tokens.some((t) => t.toLowerCase() === secretTag);

const applyParsedFilter = (parsedFilter, point) => {
    const { tokens, operator } = parsedFilter;
    if (tokens.length === 0) return true;
    return operator === filterOperatorOr
        ? tokens.some((t) => tokenMatchesPoint(t, point))
        : tokens.every((t) => tokenMatchesPoint(t, point));
};

const applyFilter = (parsedFilter, point) => {
    const isSecret = (point.tags ?? []).includes(secretTag);
    if (isSecret && !filterIncludesSecretToken(parsedFilter)) return false;
    return applyParsedFilter(parsedFilter, point);
};

export { filterOperatorAnd, filterOperatorOr, chipTypeToken, chipTypeOperator, chipTypeInvalid, classifyChip, chipsToFilter, parseFilterText, applyFilter, filterIncludesSecretToken };
