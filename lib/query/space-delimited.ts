import { joined } from "./joined.ts";

/**
 * `spaceDelimited`. One key, its items joined with a space that encodes as %20
 */
export function encodeSpaceDelimited(name: string, value: unknown) {
	return joined(name, value, " ");
}
