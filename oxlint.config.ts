import { defineConfig } from "@block65/shared-config/oxlint";

export default defineConfig({
	// Codegen output, ignored by the previous .oxlintrc.json as well
	ignorePatterns: ["test/fixtures/**"],

	groups: { vitest: "on", valibot: "on" },
});
