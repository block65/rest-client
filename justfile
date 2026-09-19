# https://just.systems

_default: typecheck

# typecheck with tsc
typecheck:
	pnpm exec tsc

# lint
lint:
	pnpm exec oxlint

# typecheck, then run the test suite
test: typecheck
	pnpm exec vitest run

# apply lint fixes, then format
pretty:
	pnpm exec oxlint --fix
	pnpm exec oxfmt

# report formatting that pretty would change
pretty-check:
	pnpm exec oxfmt --check

# what CI runs
check: typecheck lint pretty-check test

# remove installed dependencies
dist-clean:
	rm -rf node_modules
