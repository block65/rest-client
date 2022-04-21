SRC = $(wildcard src)

all: dist

node_modules: package.json yarn.lock
	yarn install

yarn.lock: package.json
	yarn install

test: dist node_modules
	yarn test

dist: node_modules
	yarn tsc -b

clean:
	rm -rf dist

distclean: clean
	rm -rf node_modules
