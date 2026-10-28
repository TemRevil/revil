import { describe, expect, it } from "vitest";
import { approxDocBytes, attachmentPath, futureSlots, greetingName, replyPath, timeAtOffset, unrepliedCount, visitorOffset } from "./forms.js";

const BUCKET = "temrevil1.appspot.com";
const fb = (bucket: string, path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=t`;

describe("attachmentPath", () => {
  it("accepts a visitor upload in our bucket", () => {
    expect(attachmentPath(fb(BUCKET, "emails/1781_ab12/cv.pdf"), BUCKET)).toBe("emails/1781_ab12/cv.pdf");
    expect(attachmentPath(`https://storage.googleapis.com/${BUCKET}/emails/1781_ab12/cv.pdf`, BUCKET)).toBe("emails/1781_ab12/cv.pdf");
  });

  it("never yields a site image or anything outside emails/<folder>/<file>", () => {
    expect(attachmentPath(fb(BUCKET, "src/imgs/hero.png"), BUCKET)).toBeNull();
    expect(attachmentPath(fb(BUCKET, "emails/../src/imgs/hero.png"), BUCKET)).toBeNull();
    expect(attachmentPath(fb(BUCKET, "emails/a/b/c.png"), BUCKET)).toBeNull();
    expect(attachmentPath(fb(BUCKET, "replies/x/y.pdf"), BUCKET)).toBeNull();
  });

  it("refuses other buckets, hosts and schemes", () => {
    expect(attachmentPath(fb("evil-bucket", "emails/a/b.pdf"), BUCKET)).toBeNull();
    expect(attachmentPath(`https://evil.example/v0/b/${BUCKET}/o/emails%2Fa%2Fb.pdf`, BUCKET)).toBeNull();
    expect(attachmentPath(fb(BUCKET, "emails/a/b.pdf").replace("https", "http"), BUCKET)).toBeNull();
    expect(attachmentPath("not a url", BUCKET)).toBeNull();
    expect(attachmentPath(42, BUCKET)).toBeNull();
  });
});

describe("replyPath", () => {
  it("accepts only a composer upload under replies/<folder>/<file> in our bucket", () => {
    expect(replyPath(fb(BUCKET, "replies/1781_ab12/quote.pdf"), BUCKET)).toBe("replies/1781_ab12/quote.pdf");
    expect(replyPath(fb(BUCKET, "emails/1781_ab12/cv.pdf"), BUCKET)).toBeNull();
    expect(replyPath(fb(BUCKET, "replies/../src/imgs/hero.png"), BUCKET)).toBeNull();
    expect(replyPath(fb("evil-bucket", "replies/a/b.pdf"), BUCKET)).toBeNull();
  });
});

describe("greetingName", () => {
  it("keeps a plain name in any script", () => {
    expect(greetingName("  Sam   Lee ")).toBe("Sam Lee");
    expect(greetingName("محمد علي")).toBe("محمد علي");
  });

  it("drops anything that is not just a short name", () => {
    for (const v of ["Visit http://spam.example", "Call +1 555 0100", "Win $$$", "a".repeat(41), "", "<b>x</b>", 7]) {
      expect(greetingName(v)).toBeNull();
    }
  });
});

describe("guest times", () => {
  it("shows an instant on the guest's own clock", () => {
    expect(timeAtOffset(Date.UTC(2026, 0, 15, 8), 2)).toBe("15/01/2026 at 10:00 AM (UTC+02:00)");
    expect(timeAtOffset(Date.UTC(2026, 0, 15, 8), -3.5)).toBe("15/01/2026 at 04:30 AM (UTC-03:30)");
  });

  it("accepts only real offsets", () => {
    expect(visitorOffset(5.75)).toBe(5.75);
    expect(visitorOffset(-3.5)).toBe(-3.5);
    expect(visitorOffset(15)).toBeNull();
    expect(visitorOffset(1.1)).toBeNull();
    expect(visitorOffset("3")).toBeNull();
  });
});

describe("public busy slots", () => {
  const now = Date.UTC(2026, 9, 27, 12); // 27/10/2026 12:00 UTC
  const meetings = {
    old: { Date: "04/04/2026", Time: "10:00 AM", Name: "Past guest", Email: "p@example.com" },
    ending: { Date: "27/10/2026", Time: "01:30 PM" }, // UTC+2: 11:30 UTC, still running
    later: { Date: "30/10/2026", Time: "09:00 AM", MeetingLink: "https://meet.google.com/abc" },
    soon: { Date: "28/10/2026", Time: "09:00 AM" },
    junk: { Date: 5 },
  };

  it("publishes only meetings that have not ended, in time order, with no other field", () => {
    expect(futureSlots(meetings, 2, now)).toEqual([
      { Date: "27/10/2026", Time: "01:30 PM" },
      { Date: "28/10/2026", Time: "09:00 AM" },
      { Date: "30/10/2026", Time: "09:00 AM" },
    ]);
  });
});

describe("inbox load", () => {
  it("counts only messages not yet replied to", () => {
    expect(unrepliedCount({ a: { Name: "x" }, b: { Name: "y", RepliedAt: 5 }, c: null })).toBe(1);
  });

  it("measures stored size in UTF-8 bytes", () => {
    expect(approxDocBytes({ a: "é" })).toBe(Buffer.byteLength('{"a":"é"}'));
  });
});