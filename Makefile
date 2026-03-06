
SRCS = $(wildcard src/** lib/**)

all: typecheck

.PHONY: distclean
distclean:
	rm -rf node_modules

.PHONY: test
test: node_modules
	pnpm exec vitest

.PHONY: test.update
test.update: node_modules
	pnpm exec vitest -u

node_modules: package.json
	pnpm install

.PHONY: typecheck
typecheck: node_modules tsconfig.json $(SRCS)
	pnpm exec tsc

.PHONY: pretty
pretty: node_modules
	pnpm exec eslint --fix .
