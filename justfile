check: typecheck lint fmt-check test dead-code

typecheck:
	pnpm exec oxlint --type-aware --type-check

lint:
	pnpm exec oxlint

# CI reads the annotations, which only this format writes
lint-ci:
	pnpm exec oxlint --format=github

fmt:
	pnpm exec oxfmt

fmt-check:
	pnpm exec oxfmt --check

test:
	pnpm exec vitest run

dead-code:
	pnpm exec fallow

clean:
	rm -rf node_modules

# no build, so just alias and keep the standard
dist-clean: clean
