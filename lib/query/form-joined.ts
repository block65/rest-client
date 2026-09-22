import { joined } from "./joined.ts";

/**
 * `form` without `explode`. One key, its items joined with a comma
 */
export function writeFormJoined(name: string, value: unknown) {
	return joined(name, value, ",");
}
