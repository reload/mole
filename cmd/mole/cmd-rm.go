package main

import (
	"flag"
	"os"
)

func init() {
	commands["rm"] = command{rmCommand, msgRmShort}
}

func rmCommand(args []string) error {
	fs := flag.NewFlagSet("rm", flag.ExitOnError)
	fs.Usage = usageFor(fs, msgPushUsage)
	fs.Parse(args)
	args = fs.Args()

	if len(args) != 1 {
		fs.Usage()
		os.Exit(3)
	}

	tunnelname := args[0]

	cl := NewClient(serverIni.address, serverIni.fingerprint)
	_, err := authenticated(cl, func() (interface{}, error) {
		return nil, cl.Delete(tunnelname)
	})
	fatalErr(err)

	okf(msgOkDeleted, tunnelname)
	return nil
}