import type { BrainstormPrompt } from '$lib/brainstorm';

export function promptQueue(prompts: BrainstormPrompt[], answered: ReadonlySet<string>): string[] {
  const unanswered = prompts.filter((prompt) => !answered.has(prompt.id));
  return (unanswered.length ? unanswered : prompts).map((prompt) => prompt.id);
}

export function adjacentPrompt(
  prompts: BrainstormPrompt[],
  answered: ReadonlySet<string>,
  currentId: string,
  direction: 1 | -1
): string {
  const queue = new Set(promptQueue(prompts, answered));
  const start = prompts.findIndex((prompt) => prompt.id === currentId);
  for (let offset = 1; offset <= prompts.length; offset++) {
    const index = (start + direction * offset + prompts.length * 2) % prompts.length;
    if (queue.has(prompts[index].id)) return prompts[index].id;
  }
  return '';
}

export function randomPrompt(
  prompts: BrainstormPrompt[],
  answered: ReadonlySet<string>,
  currentId: string
): string {
  const queue = promptQueue(prompts, answered);
  const others = queue.filter((id) => id !== currentId);
  const pool = others.length ? others : queue;
  return pool[Math.floor(Math.random() * pool.length)] ?? '';
}
