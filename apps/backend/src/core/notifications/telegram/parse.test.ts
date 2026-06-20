import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumberedReply } from "./parse";

test("parses multiple numbered answers", () => {
    const result = parseNumberedReply("1) Yes\n2) 5 years\n3) Remote");
    assert.equal(result.get(1), "Yes");
    assert.equal(result.get(2), "5 years");
    assert.equal(result.get(3), "Remote");
});

test("handles dot and colon separators and extra whitespace", () => {
    const result = parseNumberedReply("1. Sao Paulo\n\n2:  yes ");
    assert.equal(result.get(1), "Sao Paulo");
    assert.equal(result.get(2), "yes");
});

test("keeps multi-line answer text until the next number", () => {
    const result = parseNumberedReply("1) line one\nline two\n2) done");
    assert.equal(result.get(1), "line one\nline two");
    assert.equal(result.get(2), "done");
});

test("returns empty map when no numbering present", () => {
    const result = parseNumberedReply("just some text");
    assert.equal(result.size, 0);
});
