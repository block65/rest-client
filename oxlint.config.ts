import { defineConfig } from "@block65/shared-config/oxlint";

export default defineConfig({
	// Codegen output
	ignorePatterns: ["test/fixtures/**"],

	groups: { vitest: "on", valibot: "on" },

	overrides: [
		{
			// null and BigInt are what these tests drive through the client
			files: ["test/**"],
			rules: {
				"unicorn/no-null": "off",
				"unicorn/prefer-bigint-literals": "off",
			},
		},
	],
});
