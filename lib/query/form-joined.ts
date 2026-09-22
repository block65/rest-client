import { joined } from "./joined.ts";

/**
 * `form` without `explode`. One key, its items joined with a comma
 */
export function encodeFormJoined(name: string, value: unknown) {
	return joined(name, value, ",");
}
