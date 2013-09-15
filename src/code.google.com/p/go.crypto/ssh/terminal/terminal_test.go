// Copyright 2011 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package terminal

import (
	"io"
	"testing"
)

type MockTerminal struct {
	toSend       []byte
	bytesPerRead int
	received     []byte
}

func (c *MockTerminal) Read(data []byte) (n int, err error) {
	n = len(data)
	if n == 0 {
		return
	}
	if n > len(c.toSend) {
		n = len(c.toSend)
	}
	if n == 0 {
		return 0, io.EOF
	}
	if c.bytesPerRead > 0 && n > c.bytesPerRead {
		n = c.bytesPerRead
	}
	copy(data, c.toSend[:n])
	c.toSend = c.toSend[n:]
	return
}

func (c *MockTerminal) Write(data []byte) (n int, err error) {
	c.received = append(c.received, data...)
	return len(data), nil
}

func TestClose(t *testing.T) {
	c := &MockTerminal{}
	ss := NewTerminal(c, "> ")
	line, err := ss.ReadLine()
	if line != "" {
		t.Errorf("Expected empty line but got: %s", line)
	}
	if err != io.EOF {
		t.Errorf("Error should have been EOF but got: %s", err)
	}
}

var keyPressTests = []struct {
	in             string
	line           string
	err            error
	throwAwayLines int
}{
	{
		err: io.EOF,
	},
	{
		in:   "\r",
		line: "",
	},
	{
		in:   "foo\r",
		line: "foo",
	},
	{
		in:   "a\x1b[Cb\r", // right
		line: "ab",
	},
	{
		in:   "a\x1b[Db\r", // left
		line: "ba",
	},
	{
		in:   "a\177b\r", // backspace
		line: "b",
	},
	{
		in: "\x1b[A\r", // up
	},
	{
		in: "\x1b[B\r", // down
	},
	{
		in:   "line\x1b[A\x1b[B\r", // up then down
		line: "line",
	},
	{
		in:             "line1\rline2\x1b[A\r", // recall previous line.
		line:           "line1",
		throwAwayLines: 1,
	},
	{
		// recall two previous lines and append.
		in:             "line1\rline2\rline3\x1b[A\x1b[Axxx\r",
		line:           "line1xxx",
		throwAwayLines: 2,
	},
	{
		in:   "\027\r",
		line: "",
	},
	{
		in:   "a\027\r",
		line: "",
	},
	{
		in:   "a \027\r",
		line: "",
	},
	{
		in:   "a b\027\r",
		line: "a ",
	},
	{
		in:   "a b \027\r",
		line: "a ",
	},
	{
		in:   "one two thr\x1b[D\027\r",
		line: "one two r",
	},
	{
		in:   "\013\r",
		line: "",
	},
	{
		in:   "a\013\r",
		line: "a",
	},
	{
		in:   "ab\x1b[D\013\r",
		line: "a",
	},
	{
		in:   "Ξεσκεπάζω\r",
		line: "Ξεσκεπάζω",
	},
}

func TestKeyPresses(t *testing.T) {
	for i, test := range keyPressTests {
		for j := 1; j < len(test.in); j++ {
			c := &MockTerminal{
				toSend:       []byte(test.in),
				bytesPerRead: j,
			}
			ss := NewTerminal(c, "> ")
			for k := 0; k < test.throwAwayLines; k++ {
				_, err := ss.ReadLine()
				if err != nil {
					t.Errorf("Throwaway line %d from test %d resulted in error: %s", k, i, err)
				}
			}
			line, err := ss.ReadLine()
			if line != test.line {
				t.Errorf("Line resulting from test %d (%d bytes per read) was '%s', expected '%s'", i, j, line, test.line)
				break
			}
			if err != test.err {
				t.Errorf("Error resulting from test %d (%d bytes per read) was '%v', expected '%v'", i, j, err, test.err)
				break
			}
		}
	}
}

func TestPasswordNotSaved(t *testing.T) {
	c := &MockTerminal{
		toSend:       []byte("password\r\x1b[A\r"),
		bytesPerRead: 1,
	}
	ss := NewTerminal(c, "> ")
	pw, _ := ss.ReadPassword("> ")
	if pw != "password" {
		t.Fatalf("failed to read password, got %s", pw)
	}
	line, _ := ss.ReadLine()
	if len(line) > 0 {
		t.Fatalf("password was saved in history")
	}
}