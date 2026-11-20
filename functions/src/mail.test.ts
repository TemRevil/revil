import { describe, expect, it } from "vitest";
import { HELLO_EMAIL, ownerRecipients } from "./mail.js";

describe("owner notice recipients", () => {
  it("sends to the owner's inbox, hello@ and every extra inbox, each once", () => {
    expect(ownerRecipients(HELLO_EMAIL, "me@gmail.com")).toEqual([HELLO_EMAIL, "me@gmail.com"]);
    expect(ownerRecipients("Me@Gmail.com", " me@gmail.com , other@x.io,,")).toEqual(["Me@Gmail.com", HELLO_EMAIL, "other@x.io"]);
  });

  it("ignores an empty or malformed extra list", () => {
    expect(ownerRecipients(HELLO_EMAIL, "")).toEqual([HELLO_EMAIL]);
    expect(ownerRecipients(HELLO_EMAIL, "not an address")).toEqual([HELLO_EMAIL]);
  });
});
