/**
 * MOCK: the call-plan chat agent.
 *
 * The real version is an LLM call: send the host's message, the event
 * description and the current `CallPlan` as JSON; ask for a reply plus a
 * revised `CallPlan`. Then diff the two plans (keep `diffPlans` below) so the UI
 * can highlight what changed and offer undo.
 *
 * This stub understands a handful of phrases so the demo flows end to end.
 */
import { callMinutes } from '../format';
import type { CallPlan, CallQuestion } from '../types';

export type AgentResult = {
  reply: string;
  plan: CallPlan;
};

let nextId = 100;
const newId = () => `q${nextId++}`;

/** If `focusId` is set, the host selected one question and the request applies to just that one. */
export async function askPlanAgent(message: string, plan: CallPlan, focusId?: string): Promise<AgentResult> {
  await new Promise((r) => setTimeout(r, 700)); // feel like a network call
  const m = message.toLowerCase();
  let next: CallPlan = structuredClone(plan);
  const notes: string[] = [];

  const clearMarks = (qs: CallQuestion[]) => qs.map(({ changedBy: _drop, ...q }) => q);
  next.questions = clearMarks(next.questions);

  if (focusId) {
    const q = next.questions.find((x) => x.id === focusId);
    if (q && /short|simpl|casual/.test(m)) {
      q.text = q.text.split(/[?,]/)[0].trim() + '?';
      q.changedBy = 'chat';
      notes.push('Tightened that question.');
    }
  }

  if (/stage/.test(m) && !next.questions.some((q) => /stage/i.test(q.text))) {
    next.questions.splice(2, 0, { id: newId(), text: 'What stage is your company at?', gets: ['company stage'], isKey: false, changedBy: 'chat' });
    next.goal = next.goal.replace('what they do,', 'what they do, their company’s stage,');
    notes.push('Added a question about company stage.');
  }
  if (/hiring/.test(m) && !next.questions.some((q) => /hiring\?/i.test(q.text))) {
    next.questions.push({ id: newId(), text: 'Are you hiring right now? For what roles?', gets: ['hiring'], isKey: false, changedBy: 'chat' });
    notes.push('Added a hiring question.');
  }
  if (/(drop|remove|cut).*(one person|heavy|last)|one person/.test(m)) {
    const idx = next.questions.findIndex((q) => /one person/i.test(q.text));
    if (idx >= 0) {
      next.removed = [...next.removed, next.questions[idx]];
      next.questions.splice(idx, 1);
      notes.push('Removed the “one person” question.');
    }
  }
  if (/short/.test(m) && !focusId) {
    const idx = next.questions.map((q) => !q.isKey).lastIndexOf(true);
    if (idx >= 0 && next.questions.length > 2) {
      next.removed = [...next.removed, next.questions[idx]];
      next.questions.splice(idx, 1);
      notes.push('Cut a question to keep calls short.');
    }
  }
  if (/casual|relax|chill/.test(m) && !focusId) {
    next.opening = { ...next.opening, tone: 'warm' };
    notes.push('Set the tone to warm and casual.');
  }

  if (notes.length === 0) {
    next = plan;
    return {
      plan,
      reply: 'I’m not sure what to change there. Try “add a question about hiring”, “make calls shorter”, or select a question and ask about just that one.',
    };
  }
  return { plan: next, reply: `${notes.join(' ')} Calls are now about ${callMinutes(next.questions.length)} min.` };
}

/** Human-readable summary of what changed between two plans, for the chat receipt. */
export function diffPlans(before: CallPlan, after: CallPlan) {
  const beforeIds = new Set(before.questions.map((q) => q.id));
  const afterIds = new Set(after.questions.map((q) => q.id));
  const added = after.questions.filter((q) => !beforeIds.has(q.id)).map((q) => q.text);
  const removed = before.questions.filter((q) => !afterIds.has(q.id)).map((q) => q.text);
  const updated: string[] = [];
  for (const q of after.questions) {
    const old = before.questions.find((b) => b.id === q.id);
    if (old && old.text !== q.text) updated.push(q.text);
  }
  if (before.goal !== after.goal) updated.push('Goal of each call');
  if (before.opening.tone !== after.opening.tone) updated.push('Tone');
  return { added, removed, updated };
}
