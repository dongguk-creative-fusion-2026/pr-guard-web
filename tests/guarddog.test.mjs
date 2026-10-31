import assert from "node:assert/strict";
import { test } from "node:test";
import { guarddogNeedsAttention, guarddogVerdictLine, pickGuardDog } from "../src/lib/guarddog.ts";

const report = (status) => ({
  status, scope: "NEW_DIRECT_NPM_PYPI", counts: { total: 0, completed: 0, partial: 0, failed: 0, skipped: 0, risks: 0 },
  packages: [], problems: [], durationMs: 0, requiresAttention: status === "PARTIAL" || status === "FAILED",
});

test("historical reviews have no report, including an older backend's events", () => {
  assert.equal(pickGuardDog(null, []), null);
  assert.equal(pickGuardDog({}, [{ stage: "CHECK_C", status: "DONE", data: { findings: [] } }]), null);
  assert.equal(guarddogNeedsAttention(null), false);
});

test("saved context takes precedence over stage events", () => {
  const saved = report("FAILED");
  assert.equal(pickGuardDog({ guarddog: saved }, [{ stage: "VERDICT", status: "DONE", data: { guarddog: report("COMPLETED") } }]), saved);
});

test("event fallback uses the latest completed security/verdict report only", () => {
  const completed = report("PARTIAL");
  const events = [
    { stage: "CHECK_C", status: "DONE", data: { guarddog: report("FAILED") } },
    { stage: "VERDICT", status: "DONE", data: { guarddog: completed } },
    { stage: "CHECK_C", status: "RUNNING", data: { guarddog: report("COMPLETED") } },
    { stage: "LLM", status: "DONE", data: { guarddog: report("COMPLETED") } },
  ];
  assert.equal(pickGuardDog({ guarddog: null }, events), completed);
});

test("zero findings and zero failed packages do not hide incomplete coverage", () => {
  for (const status of ["FAILED", "PARTIAL"]) {
    const skipped = { ...report(status), requiresAttention: false, counts: { ...report(status).counts, total: 1, skipped: 1 } };
    assert.equal(guarddogNeedsAttention(skipped), true);
    assert.match(guarddogVerdictLine("NEEDS_CHANGES", skipped), /검증이 미완료/);
  }
});

test("disabled, no changes and completed do not imply a scan failure", () => {
  for (const status of ["DISABLED", "NO_CHANGES", "COMPLETED"]) {
    assert.equal(guarddogNeedsAttention(report(status)), false);
    assert.equal(guarddogVerdictLine("MERGEABLE", report(status)), null);
  }
});

test("a blocking verdict keeps its stronger instruction even if GuardDog failed", () => {
  assert.equal(guarddogVerdictLine("NOT_RECOMMENDED", report("FAILED")), null);
});

test("explicit requiresAttention is respected", () => {
  assert.equal(guarddogNeedsAttention({ ...report("COMPLETED"), requiresAttention: true }), true);
});
