import { applyPromptAnswer, BRAINSTORM_PROMPTS, getPrompt, isTagPrompt } from '$lib/brainstorm';
import { ENTITY_FIELDS } from '$lib/entityFields';
import type { EntityType } from '$lib/types';

function prompt(type: EntityType, id: string) {
  const p = getPrompt(type, id);
  if (!p) throw new Error(`missing prompt ${type}/${id}`);
  return p;
}

describe('BRAINSTORM_PROMPTS', () => {
  it('offers at least 25 distinct questions for every entity type', () => {
    expect(Object.keys(BRAINSTORM_PROMPTS)).toHaveLength(7);
    for (const prompts of Object.values(BRAINSTORM_PROMPTS)) {
      expect(prompts.length).toBeGreaterThanOrEqual(25);
      expect(new Set(prompts.map((prompt) => prompt.question)).size).toBe(prompts.length);
      for (const prompt of prompts) {
        expect(prompt.id.trim()).not.toBe('');
        expect(prompt.category.trim()).not.toBe('');
        expect(prompt.question.trim()).not.toBe('');
        if (prompt.suggestions) {
          expect(new Set(prompt.suggestions).size).toBe(prompt.suggestions.length);
          expect(prompt.suggestions.length).toBeGreaterThanOrEqual(18);
        }
      }
    }
  });

  it('has unique ids per type and only targets fields that exist', () => {
    for (const [type, prompts] of Object.entries(BRAINSTORM_PROMPTS)) {
      const ids = prompts.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of prompts) {
        if (!p.field) continue;
        expect(ENTITY_FIELDS[type as EntityType].some((f) => f.key === p.field)).toBe(true);
      }
    }
  });

  it('only offers suggestions on tag prompts', () => {
    for (const [type, prompts] of Object.entries(BRAINSTORM_PROMPTS)) {
      for (const p of prompts.filter((p) => p.suggestions)) {
        expect(isTagPrompt(type as EntityType, p)).toBe(true);
      }
    }
  });
});

describe('applyPromptAnswer', () => {
  it('appends a question section to the body when the prompt has no field', () => {
    const data = applyPromptAnswer(
      'character',
      { body: 'Existing notes.\n\n', frontmatter: {} },
      prompt('character', 'bad-day'),
      '  Stranded in a storm.  '
    );
    expect(data.body).toBe(
      'Existing notes.\n\n### What does a truly bad day look like for them?\n\nStranded in a storm.\n'
    );
    expect(data.answeredPrompts).toEqual(['bad-day']);
  });

  it('writes character answers to their own fields instead of the body', () => {
    const fear = applyPromptAnswer(
      'character',
      { body: '', frontmatter: {} },
      prompt('character', 'fear'),
      'Deep water.'
    );
    expect(fear.fears).toBe('Deep water.');
    expect(fear.body).toBeUndefined();

    const flaws = applyPromptAnswer(
      'character',
      { body: '', frontmatter: { virtues: ['brave'] } },
      prompt('character', 'flaws'),
      'reckless, vain'
    );
    expect(flaws.flaws).toEqual(['reckless', 'vain']);
    expect(flaws.virtues).toBeUndefined();
  });

  it('starts the body with the section when it was empty', () => {
    const data = applyPromptAnswer(
      'note',
      { body: '', frontmatter: {} },
      prompt('note', 'core'),
      'A city that moves.'
    );
    expect(data.body).toBe('### Sum up this idea in one sentence.\n\nA city that moves.\n');
  });

  it('merges tags case-insensitively without duplicates', () => {
    const data = applyPromptAnswer(
      'character',
      { body: '', frontmatter: { virtues: ['Loyal'] } },
      prompt('character', 'virtues'),
      'loyal, brave, brave, curious'
    );
    expect(data.virtues).toEqual(['Loyal', 'brave', 'curious']);
    expect(data.body).toBeUndefined();
  });

  it('appends to an existing textarea field', () => {
    const data = applyPromptAnswer(
      'character',
      { body: '', frontmatter: { motivations: 'Revenge.' } },
      prompt('character', 'want'),
      'To be remembered.'
    );
    expect(data.motivations).toBe('Revenge.\n\nTo be remembered.');
  });

  it('does not record the same prompt twice', () => {
    const data = applyPromptAnswer(
      'location',
      { body: '', frontmatter: { answeredPrompts: ['senses'] } },
      prompt('location', 'senses'),
      'Salt and smoke.'
    );
    expect(data.answeredPrompts).toEqual(['senses']);
  });
});
