SRCS = $(wildcard src/**)

all: dist

.PHONY: deps
deps: node_modules

.PHONY: clean
clean:
	pnpm exec tsc -b --clean
	rm -rf dist

.PHONY: distclean
distclean: clean
	rm -rf node_modules

.PHONY: test
test: node_modules dist
	pnpm exec vitest

.PHONY: test.update
test.update: node_modules
	pnpm exec vitest -u

node_modules: package.json
	pnpm install

dist: node_modules tsconfig.json $(SRCS)
	pnpm exec tsc

.PHONY: dev
dev: node_modules
	pnpm exec tsc -w

.PHONY: pretty
pretty: node_modules
	pnpm exec eslint --fix .
	pnpm exec prettier --write .
