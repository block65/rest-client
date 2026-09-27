/**
 * Decodes one chunk's `data` string, and may return a Promise. Must be
 * stateless, as one function decodes every chunk of every response
 */
export type DataTransformer = (data: string) => unknown;

export function jsonDataTransformer(data: string): unknown {
	return JSON.parse(data);
}

export function textDataTransformer(data: string) {
	return data;
}
