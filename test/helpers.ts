import type { Entries, UnknownRecord } from "type-fest";

export function typedObjectEntries<T extends UnknownRecord>(obj: T) {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing Object.entries to the record's entries is the point
	return Object.entries(obj) as Entries<T>;
}
