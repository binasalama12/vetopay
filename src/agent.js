import { DECISIONS } from './veto.js';

/**
 * Agent harness: receives tasks (an instruction + a plan of PayPal MCP
 * tool calls) and executes each call ONLY through the veto layer.
 *
 * A "task" models what an LLM agent would hand us after reasoning:
 * the instruction text, its provenance (who/what produced it — the
 * single most important security signal), and the tool calls it wants.
 * Untrusted content (emails, invoice notes) may arrive as tasks too —
 * the veto layer is what stops them from moving money.
 */
export class AgentHarness {
  constructor({ transport, veto, audit, approver, log = console.log }) {
    this.transport = transport;
    this.veto = veto;
    this.audit = audit;
    this.approver = approver;
    this.log = log;
  }

  async executeTask(task) {
    const { instruction = '', source = 'user', calls = [] } = task;
    this.log(`\n[TASK] source=${source} :: ${instruction}`);
    this.audit.record('task_received', { source, instruction });
    const results = [];

    for (const call of calls) {
      const lookup = (kind, idValue) =>
        typeof this.transport.lookup === 'function'
          ? this.transport.lookup(kind, idValue) : null;
      const decision = this.veto.analyze(call, {
        source, instructionText: instruction, lookup,
      });
      const vetoEntry = this.audit.record('veto_decision', {
        tool: call.tool, decision: decision.decision,
        reasons: decision.reasons, facts: decision.facts, source,
      });
      this.log(`  [${decision.decision}] ${call.tool}` +
        (decision.facts?.amount != null ? ` $${decision.facts.amount.toFixed(2)}` : '') +
        ` — ${decision.reasons.join('; ')}`);

      if (decision.decision === DECISIONS.VETOED) {
        results.push({ call, decision, executed: false });
        continue;
      }

      if (decision.decision === DECISIONS.HELD) {
        const heldEntry = this.audit.record('held_for_approval', { tool: call.tool });
        const approved = this.approver
          ? await this.approver({ call, decision, facts: decision.facts,
              source, instruction, auditEntry: heldEntry || vetoEntry,
              auditPath: this.audit?.path })
          : false;
        this.audit.record(approved ? 'human_approved' : 'human_declined', { tool: call.tool });
        this.log(approved ? '  [HUMAN] approved — executing'
                          : '  [HUMAN] declined — not executed');
        if (!approved) {
          results.push({ call, decision, executed: false });
          continue;
        }
      }

      const output = await this.transport.callTool(call.tool, call.args);
      this.audit.record('tool_executed', { tool: call.tool, output });
      this.log(`  [EXECUTED] ${call.tool} -> ${JSON.stringify(output)}`);
      results.push({ call, decision, executed: true, output });
    }
    return results;
  }
}
