SRCS = $(wildcard src/**)

all: dist

.PHONY: deps
deps: node_modules

.PHONY: clean
clean:
	yarn tsc -b --clean
	rm -rf dist

.PHONY: test
test:
	NODE_OPTIONS=--experimental-vm-modules yarn jest

node_modules: package.json
	yarn install

dist: node_modules tsconfig.json $(SRCS)
	yarn tsc

.PHONY: dev
dev:
	yarn tsc -w
