#!/bin/bash

pkg=github.com/calmh/mole
buildstamp=$(date +%s)
buildver=$(git describe --always)
builduser="$(whoami)@$(hostname)"
ldflags="-w -X main.buildStamp '$buildstamp' -X main.buildVersion '$buildver' -X main.buildUser '$builduser'"

export GOBIN=$(pwd)/bin

rm -rf auto
mkdir auto
if [[ $1 == "all" ]] ; then
	go get -d -u -v ./...

	source /usr/local/golang-crosscompile/crosscompile.bash
	for arch in linux-386 linux-amd64 darwin-amd64 ; do
		echo "$arch"
		rm -rf bin
		"go-$arch" install -ldflags "$ldflags" "$pkg/cmd/..."
		tar zcf "mole-$arch.tar.gz" bin

		mv bin/mole "auto/mole-$arch"
		mv bin/*/mole "auto/mole-$arch"
		hash=$(sha1sum auto/mole-$arch | awk '{print $1}')
		echo "{\"buildstamp\":$buildstamp, \"version\":\"$buildver\", \"hash\":\"$hash\"}" >> "auto/mole-$arch.json"
		gzip -9 "auto/mole-$arch"
	done
	for arch in windows-386 windows-amd64 ; do
		echo "$arch"
		rm -rf bin
		"go-$arch" install -ldflags "$ldflags" "$pkg/cmd/..."
		zip -r "mole-$arch.tar.zip" bin
	done
else
	go install -ldflags "$ldflags" "$pkg/cmd/..."
fi

