import type { FlowReport, FlowStepReport } from "./argent.ts";

/**
 * Flows replay without an LLM. When one breaks - the app moved a button, a
 * label changed - this is the handoff back to a human or to Claude over argent
 * MCP. Nothing repairs itself: the corrected YAML is a reviewed commit.
 */
export class FlowFailure extends Error {
  constructor(
    readonly sceneId: string,
    readonly flowPath: string,
    readonly udid: string,
    readonly report: FlowReport,
  ) {
    super(`Flow failed for scene "${sceneId}" (${flowPath})`);
    this.name = "FlowFailure";
  }
}

export function repairBrief(failure: FlowFailure): string {
  const step = failure.report.failed;
  const lines = [
    "",
    `FLOW FAILED  scene "${failure.sceneId}"`,
    `  file    ${failure.flowPath}`,
    `  device  ${failure.udid}`,
  ];

  if (step) {
    lines.push(`  step    #${step.index ?? "?"} ${describe(step)}`);
    if (step.reason) lines.push(`  reason  ${step.reason}`);
    if (step.error) lines.push(`  error   ${step.error}`);
  } else {
    lines.push("  step    (no step-level failure in the report - see output below)");
    lines.push(indent(failure.report.stdout.trim().split("\n").slice(-15).join("\n")));
  }

  lines.push(
    "",
    "To repair:",
    `  1. argent run describe --udid ${failure.udid}`,
    "  2. Find the element the step meant to hit and note its text or identifier.",
    `  3. Edit ${failure.flowPath} - prefer a text:/id: selector over coordinates.`,
    `  4. argent flow run ${failure.flowPath} --device ${failure.udid}`,
    "",
    "Claude can do steps 1-3 over argent MCP with describe / flow-start-recording /",
    "flow-add-step, but the edited YAML is yours to review before it is committed.",
    "",
  );
  return lines.join("\n");
}

function describe(step: FlowStepReport): string {
  const parts = [step.kind ?? step.tool ?? "step", step.target ?? ""].filter(Boolean);
  return parts.join(" ").trim();
}

const indent = (s: string) => s.split("\n").map((l) => `          ${l}`).join("\n");
