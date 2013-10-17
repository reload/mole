package ticket_test

import (
	"github.com/calmh/mole/ticket"
	"testing"
)

func TestGrantVerifyOK(t *testing.T) {
	tic := ticket.Grant("jb", "10.2.3.4", 1234567890)

	user, err := ticket.Verify(tic, "10.2.3.4", 1234567890)
	if user != "jb" {
		t.Errorf("unexpected user %q", user)
	}
	if err != nil {
		t.Errorf("unexpected err %s", err)
	}
}

func TestGrantVerifyIncorrectIP(t *testing.T) {
	tic := ticket.Grant("jb", "10.2.3.4", 1234567890)

	user, err := ticket.Verify(tic, "10.2.3.5", 1234567890)
	if user != "" {
		t.Errorf("unexpected user %q", user)
	}
	if err == nil {
		t.Errorf("unexpected nil err")
	}
}

func TestGrantVerifyExpired(t *testing.T) {
	tic := ticket.Grant("jb", "10.2.3.4", 1234567890)

	user, err := ticket.Verify(tic, "10.2.3.4", 1234567891)
	if user != "" {
		t.Errorf("unexpected user %q", user)
	}
	if err == nil {
		t.Errorf("unexpected nil err")
	}
}

func TestGrantVerifyModified(t *testing.T) {
	tic := ticket.Grant("jb", "10.2.3.4", 1234567890)

	fail := "A" + tic[:len(tic)-1]
	user, err := ticket.Verify(fail, "10.2.3.4", 1234567890)
	if user != "" {
		t.Errorf("unexpected user %q", user)
	}
	if err == nil {
		t.Errorf("unexpected nil err")
	}
}

func TestGrantVerifyReinitialized(t *testing.T) {
	tic := ticket.Grant("jb", "10.2.3.4", 1234567890)

	ticket.Init()

	user, err := ticket.Verify(tic, "10.2.3.4", 1234567890)
	if user != "" {
		t.Errorf("unexpected user %q", user)
	}
	if err == nil {
		t.Errorf("unexpected nil err")
	}
}
