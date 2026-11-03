import { createEntity } from './entities';
import { createStory, createChapter, createScene, updateScene } from './stories';
import { createPlotline, linkSceneToBeat } from './plots';
import { addRelation } from './relations';
import { addEvent } from './timelines';
import { getNoteTemplate } from './templates';

export type ProjectPreset = 'blank' | 'novel' | 'series' | 'campaign';

export const PROJECT_PRESETS: Record<ProjectPreset, { label: string; description: string }> = {
  blank: { label: 'Blank', description: 'An empty project. Add what you need as you go.' },
  novel: {
    label: 'Novel',
    description: 'A story with a first chapter, a Save the Cat plotline, and a story bible note.'
  },
  series: {
    label: 'Series',
    description: "Book one, a Hero's Journey series arc, a series bible, and a chapter plan."
  },
  campaign: {
    label: 'Tabletop campaign',
    description:
      'A campaign overview, a session log with one chapter per session, and a location sheet.'
  }
};

export function isPreset(value: unknown): value is ProjectPreset {
  return typeof value === 'string' && Object.hasOwn(PROJECT_PRESETS, value);
}

function noteFromTemplate(projectId: string, dataPath: string, name: string, templateId: string) {
  return createEntity(projectId, dataPath, 'note', {
    name,
    body: getNoteTemplate(templateId)?.body ?? ''
  });
}

export function applyPreset(projectId: string, dataPath: string, preset: ProjectPreset): void {
  if (preset === 'blank') return;

  if (preset === 'novel') {
    const story = createStory(dataPath, 'Untitled novel');
    const chapter = createChapter(dataPath, story.id, 'Chapter 1');
    createScene(dataPath, story.id, chapter.id);
    createPlotline(dataPath, { title: 'Main plot', storyId: story.id, template: 'save_the_cat' });
    noteFromTemplate(projectId, dataPath, 'Story bible', 'worldbuilding-note');
  }

  if (preset === 'series') {
    const story = createStory(dataPath, 'Book 1');
    const chapter = createChapter(dataPath, story.id, 'Chapter 1');
    createScene(dataPath, story.id, chapter.id);
    createPlotline(dataPath, { title: 'Series arc', storyId: story.id, template: 'heros_journey' });
    noteFromTemplate(projectId, dataPath, 'Series bible', 'worldbuilding-note');
    noteFromTemplate(projectId, dataPath, 'Book 1 chapter plan', 'chapter-plan');
  }

  if (preset === 'campaign') {
    createEntity(projectId, dataPath, 'note', {
      name: 'Campaign overview',
      body: '## Premise\n\n## Factions\n\n## Open threads\n\n## House rules\n'
    });
    const story = createStory(dataPath, 'Session log', 'One chapter per session.');
    const chapter = createChapter(dataPath, story.id, 'Session 1');
    createScene(dataPath, story.id, chapter.id, 'Recap');
    noteFromTemplate(projectId, dataPath, 'Starting town', 'location-description');
  }
}

function mention(type: string, id: string, label: string) {
  return `[@${label}](mention://${type}/${id})`;
}

export const SAMPLE_WORLD_NAME = 'Sample: The Salt Coast';

export function createSampleWorld(projectId: string, dataPath: string): void {
  const maren = createEntity(projectId, dataPath, 'character', {
    name: 'Maren Holt',
    age: '34',
    tags: ['protagonist'],
    motivations: 'Keep the lamp lit and learn why the ships stopped coming home.',
    body: 'Keeper of the Drowned Light. Patient, stubborn, and better with tides than people.'
  });
  const tobiah = createEntity(projectId, dataPath, 'character', {
    name: 'Tobiah Venn',
    tags: ['smuggler'],
    secrets: 'He knows where the missing cargo went.',
    body: 'A charming smuggler who owes Maren a favour he would rather forget.'
  });
  const ilse = createEntity(projectId, dataPath, 'character', {
    name: 'Ilse Varga',
    tags: ['antagonist'],
    body: 'Harbourmaster of Greyhaven. Keeps the peace by keeping secrets.'
  });
  const greyhaven = createEntity(projectId, dataPath, 'location', {
    name: 'Greyhaven',
    body: 'A fog-bound port town built on salt trade and old debts.'
  });
  const light = createEntity(projectId, dataPath, 'location', {
    name: 'The Drowned Light',
    body: 'A lighthouse on a tidal island. At high water the stairs vanish into the sea.'
  });
  const wardens = createEntity(projectId, dataPath, 'organization', {
    name: 'The Tidewardens',
    body: 'An old order of lamp keepers that most people think disbanded.'
  });
  createEntity(projectId, dataPath, 'note', {
    name: 'How to use this sample',
    body:
      'This project shows how the pieces fit together. Open a character, read a scene, look at the ' +
      'Relations graph and the Timeline. Delete the project from its Settings page when you are done.'
  });

  addRelation(dataPath, {
    sourceId: maren.id,
    targetId: tobiah.id,
    relationType: 'ally',
    label: 'reluctant allies'
  });
  addRelation(dataPath, {
    sourceId: maren.id,
    targetId: ilse.id,
    relationType: 'enemy',
    label: null
  });
  addRelation(dataPath, {
    sourceId: maren.id,
    targetId: wardens.id,
    relationType: 'member_of',
    label: null
  });
  addRelation(dataPath, {
    sourceId: light.id,
    targetId: greyhaven.id,
    relationType: 'related_to',
    label: 'guards the harbour of'
  });

  const story = createStory(dataPath, 'The Long Tide', 'Ships are vanishing off the Salt Coast.');
  const one = createChapter(dataPath, story.id, 'The Lamp');
  const two = createChapter(dataPath, story.id, 'The Harbour');
  const first = createScene(dataPath, story.id, one.id, 'Low water');
  updateScene(dataPath, story.id, one.id, first.id, {
    narrator: 'Maren Holt',
    place: 'The Drowned Light',
    participants: [maren.id],
    body:
      `${mention('character', maren.id, 'Maren Holt')} counted the ships twice. Four had sailed ` +
      `from ${mention('location', greyhaven.id, 'Greyhaven')} at dawn, and only three lights ` +
      'answered hers across the water.\n\nShe trimmed the wick and waited for the tide to turn.'
  });
  const second = createScene(dataPath, story.id, two.id, 'Debts');
  updateScene(dataPath, story.id, two.id, second.id, {
    narrator: 'Maren Holt',
    place: 'Greyhaven',
    participants: [maren.id, tobiah.id, ilse.id],
    body:
      `${mention('character', tobiah.id, 'Tobiah Venn')} was waiting on the quay, which was ` +
      'never a good sign.\n\n"You owe me," Maren said.\n\n"I owe everyone," he said. "Get in line."'
  });

  const plot = createPlotline(dataPath, {
    title: 'Main plot',
    storyId: story.id,
    template: 'save_the_cat'
  });
  if (plot.beats[0]) linkSceneToBeat(dataPath, plot.id, plot.beats[0].id, first.id);
  if (plot.beats[3]) linkSceneToBeat(dataPath, plot.id, plot.beats[3].id, second.id);

  addEvent(dataPath, {
    year: 812,
    month: null,
    day: null,
    era: '',
    title: 'The Tidewardens are disbanded',
    description: 'The order loses its charter after the Long Storm.',
    significance: 'major',
    entityIds: [wardens.id]
  });
  addEvent(dataPath, {
    year: 840,
    month: 3,
    day: 2,
    era: '',
    title: 'The first ship vanishes',
    description: 'A salt barge leaves Greyhaven and never arrives.',
    significance: 'major',
    entityIds: [greyhaven.id, ilse.id]
  });
}
