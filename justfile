check: typecheck lint fmt-check test

typecheck:
	pnpm exec oxlint --type-aware --type-check

lint:
	pnpm exec oxlint

fmt:
	pnpm exec oxfmt

fmt-check:
	pnpm exec oxfmt --check

test:
	pnpm exec vitest run

clean:
	rm -rf node_modules

# no build, so just alias and keep the standard
dist-clean: clean
