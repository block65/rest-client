SRC = $(wildcard src)

all: dist

node_modules: yarn.lock
	yarn install

yarn.lock: package.json
	yarn install --frozen-lockfile

test: dist node_modules
	yarn test

dist: node_modules $(SRC)
	yarn tsc -b

clean:
	rm -rf dist

distclean: clean
	rm -rf node_modules
