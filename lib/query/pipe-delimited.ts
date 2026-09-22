import { joined } from "./joined.ts";

/**
 * `pipeDelimited`. One key, its items joined with a pipe
 */
export function encodePipeDelimited(name: string, value: unknown) {
	return joined(name, value, "|");
}
