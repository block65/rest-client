import type { QueryParamSpec } from "./types.ts";

// deepObject uses bracket keys, so §4.12.6 gives it no delimiter
const queryDelimiters = {
	form: ",",
	spaceDelimited: " ",
	pipeDelimited: "|",
} as const;

// a key past this depth is left alone, so the tree stays bounded
const queryMaxDepth = 8;

// balanced, non-empty bracket groups and only those
const queryBracketsPattern = /^(?:\[[^[\]]*\])+$/;

// a segment named `__proto__` stays an ordinary member on a bare node
const queryNode: () => Record<string, unknown> = () => Object.create(null);

function isQueryNode(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function queryKeyPath(brackets: string) {
	if (!queryBracketsPattern.test(brackets)) {
		// `a[]` is a real parameter name in OpenAI's document, as `project_ids[]`
		return;
	}

	const segments = brackets.slice(1, -1).split("][");

	const usable =
		segments.length <= queryMaxDepth && segments.every((segment) => segment);

	return usable ? segments : undefined;
}

// returns a new tree, or undefined where the path collides with what is there
function placeQueryValue(
	node: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
	// TS7023 requires the annotation, because the function recurses
): Record<string, unknown> | undefined {
	const [segment, ...rest] = path;

	if (segment === undefined) {
		return;
	}

	const existing = node[segment];

	if (rest.length === 0) {
		if (segment in node) {
			return;
		}

		// Object.assign sets `__proto__` as an own property on a bare target
		return Object.assign(queryNode(), node, { [segment]: value });
	}

	if (existing !== undefined && !isQueryNode(existing)) {
		// a value already sits where a container is needed
		return;
	}

	const child = placeQueryValue(existing ?? queryNode(), rest, value);

	return child && Object.assign(queryNode(), node, { [segment]: child });
}

// appendDeep indexes an array densely from 0, so that run reads back as one
function queryNodeToValue(
	node: Record<string, unknown>,
): unknown[] | Record<string, unknown> {
	const entries = Object.keys(node).map((key) => {
		const child = node[key];

		return [key, isQueryNode(child) ? queryNodeToValue(child) : child] as const;
	});

	// a member genuinely named "0" becomes an index, which the wire cannot tell
	// apart from one
	return entries.length > 0 &&
		entries.every(([key], index) => key === String(index))
		? entries.map(([, value]) => value)
		: Object.assign(queryNode(), Object.fromEntries(entries));
}

// an unplaceable key is kept as it arrived, for a strict schema to reject
function decodeDeepObject(result: Record<string, unknown>, name: string) {
	if (name in result) {
		// the parameter arriving bare rules out a container of the same name
		return result;
	}

	const prefix = `${name}[`;
	const consumed = new Set<string>();
	let root = queryNode();

	for (const [key, value] of Object.entries(result)) {
		if (!key.startsWith(prefix)) {
			continue;
		}

		const path = queryKeyPath(key.slice(name.length));
		const placed = path && placeQueryValue(root, path, value);

		if (placed) {
			root = placed;
			consumed.add(key);
		}
	}

	if (consumed.size === 0) {
		return result;
	}

	return Object.fromEntries([
		...Object.entries(result).filter(([key]) => !consumed.has(key)),
		[name, queryNodeToValue(root)] as const,
	]);
}

// form with explode drops the parent name, leaving the members as the way back
function hoistObject(
	result: Record<string, unknown>,
	name: string,
	members: readonly string[],
) {
	const present = members.filter((member) => member in result);

	if (present.length === 0) {
		// an absent parameter stays absent, short of becoming an empty object
		return result;
	}

	const node = Object.fromEntries(
		present.map((member) => [member, result[member]] as const),
	);

	return Object.fromEntries([
		...Object.entries(result).filter(([key]) => !present.includes(key)),
		[name, node] as const,
	]);
}

// alternating member name and member value, so an odd trailing name is dropped
function pairsToObject(parts: readonly string[]) {
	const pairs: [string, string][] = [];

	for (let index = 0; index + 1 < parts.length; index += 2) {
		const member = parts[index];
		const value = parts[index + 1];

		if (member !== undefined && value !== undefined) {
			pairs.push([member, value]);
		}
	}

	return Object.fromEntries(pairs);
}

// an unexploded parameter packs its whole value into one
function splitJoined(
	result: Record<string, unknown>,
	spec: QueryParamSpec,
	delimiter: string,
) {
	const value = result[spec.name];

	if (value === undefined) {
		return result;
	}

	const parts = (Array.isArray(value) ? value : [value]).flatMap((part) =>
		String(part).split(delimiter),
	);

	return {
		...result,
		[spec.name]: spec.type === "array" ? parts : pairsToObject(parts),
	};
}

function applySpec(result: Record<string, unknown>, spec: QueryParamSpec) {
	if (spec.style === "deepObject") {
		return decodeDeepObject(result, spec.name);
	}

	if (!spec.explode) {
		return splitJoined(result, spec, queryDelimiters[spec.style]);
	}

	if (spec.type === "array") {
		const value = result[spec.name];

		// one occurrence arrives as a bare string, so the array is rebuilt here
		return value !== undefined && !Array.isArray(value)
			? { ...result, [spec.name]: [value] }
			: result;
	}

	return hoistObject(result, spec.name, spec.members ?? []);
}

/**
 * Reads back what appendSearchParams wrote. A server gets a flat map of literal
 * query keys, and Hono hands a validator that map. A schema built from the same
 * document expects the declared object or array. `style` and `explode` connect
 * the two, so a command's specs are enough to rebuild the shape.
 *
 * Only object and array parameters take a spec
 */
export function parseQuery(
	query: Record<string, string | string[]>,
	specs: readonly QueryParamSpec[],
): Record<string, unknown> {
	return specs.reduce<Record<string, unknown>>(applySpec, { ...query });
}
