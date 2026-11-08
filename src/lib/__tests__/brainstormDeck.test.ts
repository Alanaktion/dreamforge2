import { adjacentPrompt, promptQueue, randomPrompt } from '$lib/brainstormDeck';
import type { BrainstormPrompt } from '$lib/brainstorm';

const prompts: BrainstormPrompt[] = [
  { id: 'a', category: 'History', question: 'A?' },
  { id: 'b', category: 'History', question: 'B?' },
  { id: 'c', category: 'Nature', question: 'C?' },
  { id: 'd', category: 'History', question: 'D?' }
];

describe('brainstorm selection', () => {
  it('prioritizes unanswered questions and revisits once all are answered', () => {
    expect(promptQueue(prompts, new Set(['a', 'c']))).toEqual(['b', 'd']);
    expect(promptQueue(prompts, new Set(['a', 'b', 'c', 'd']))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves both ways and wraps without including answered questions', () => {
    const answered = new Set(['b']);
    expect(adjacentPrompt(prompts, answered, 'a', 1)).toBe('c');
    expect(adjacentPrompt(prompts, answered, 'a', -1)).toBe('d');
    expect(adjacentPrompt(prompts, answered, 'd', 1)).toBe('a');
    expect(adjacentPrompt(prompts, answered, 'c', -1)).toBe('a');
  });

  it('moves from a directly selected answered question in catalog order', () => {
    const answered = new Set(['b', 'c']);
    expect(adjacentPrompt(prompts, answered, 'b', 1)).toBe('d');
    expect(adjacentPrompt(prompts, answered, 'b', -1)).toBe('a');
  });

  it('advances after saving without jumping past the next unanswered question', () => {
    expect(adjacentPrompt(prompts, new Set(['a']), 'a', 1)).toBe('b');
    expect(adjacentPrompt(prompts, new Set(['a', 'b', 'c']), 'b', 1)).toBe('d');
    expect(adjacentPrompt(prompts, new Set(['a', 'b', 'c', 'd']), 'd', 1)).toBe('a');
  });

  it('keeps navigation and completion within the selected category', () => {
    const history = prompts.filter((prompt) => prompt.category === 'History');
    expect(promptQueue(history, new Set(['a', 'b']))).toEqual(['d']);
    expect(adjacentPrompt(history, new Set(['a', 'b']), 'b', 1)).toBe('d');
    expect(adjacentPrompt(history, new Set(['a', 'b', 'd']), 'd', 1)).toBe('a');
  });

  it('random selection avoids the current question and answered questions', () => {
    expect(randomPrompt(prompts, new Set(['a', 'b']), 'c')).toBe('d');
    expect(randomPrompt(prompts, new Set(['a', 'b', 'd']), 'c')).toBe('c');
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(randomPrompt(prompts, new Set(['a', 'b', 'c', 'd']), 'a')).toBe('b');
    random.mockRestore();
  });

  it('handles empty and single-question collections', () => {
    expect(promptQueue([], new Set())).toEqual([]);
    expect(adjacentPrompt([], new Set(), '', 1)).toBe('');
    expect(randomPrompt([], new Set(), '')).toBe('');
    expect(adjacentPrompt([prompts[0]], new Set(), 'a', -1)).toBe('a');
  });
});
