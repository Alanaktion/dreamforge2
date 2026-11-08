import { ENTITY_FIELDS } from '$lib/entityFields';
import type { EntityType } from '$lib/types';

export interface BrainstormPrompt {
  id: string;
  category: string;
  question: string;
  field?: string;
  suggestions?: string[];
}

const VIRTUES = [
  'loyal',
  'brave',
  'patient',
  'honest',
  'generous',
  'curious',
  'disciplined',
  'compassionate',
  'resourceful',
  'witty',
  'humble',
  'protective',
  'fair-minded',
  'steadfast',
  'forgiving',
  'inventive',
  'considerate',
  'hopeful'
];

const FLAWS = [
  'arrogant',
  'reckless',
  'jealous',
  'stubborn',
  'cowardly',
  'vain',
  'impulsive',
  'secretive',
  'cynical',
  'greedy',
  'self-righteous',
  'distrustful',
  'controlling',
  'resentful',
  'indecisive',
  'perfectionistic',
  'dismissive',
  'possessive'
];

const QUIRKS = [
  'hums when nervous',
  'collects trinkets',
  'never sits with back to a door',
  'talks to animals',
  'counts steps',
  'terrible at lying',
  'always hungry',
  'quotes old proverbs',
  'overly formal',
  'fidgets with a ring',
  'sleeps very little',
  'laughs at the wrong moments',
  'rehearses conversations',
  'labels everything',
  'keeps unfinished letters',
  'makes elaborate tea',
  'repairs things absentmindedly',
  'remembers every birthday'
];

const SPECIES_TRAITS = [
  'nocturnal',
  'long-lived',
  'telepathic',
  'amphibious',
  'hive-minded',
  'shapeshifting',
  'cold-blooded',
  'winged',
  'venomous',
  'photosynthetic',
  'nomadic',
  'solitary',
  'bioluminescent',
  'burrowing',
  'migratory',
  'echolocating',
  'regenerative',
  'color-changing'
];

const ITEM_PROPERTIES = [
  'cursed',
  'sentient',
  'unbreakable',
  'glows in darkness',
  'bound to a bloodline',
  'forged from meteorite',
  'hums near danger',
  'cannot be sold',
  'slowly corrupting',
  'key to something',
  'counterfeit',
  'one of a pair',
  'self-repairing',
  'weather-sensitive',
  'folds impossibly small',
  'records nearby sounds',
  'changes with its owner',
  'works only in pairs'
];

export const BRAINSTORM_PROMPTS: Record<EntityType, BrainstormPrompt[]> = {
  character: [
    {
      id: 'virtues',
      category: 'Traits',
      question: 'What are their best qualities?',
      field: 'virtues',
      suggestions: VIRTUES
    },
    {
      id: 'flaws',
      category: 'Traits',
      question: 'What flaws get them into trouble?',
      field: 'flaws',
      suggestions: FLAWS
    },
    {
      id: 'quirks',
      category: 'Traits',
      question: 'What quirks or habits make them memorable?',
      field: 'quirks',
      suggestions: QUIRKS
    },
    {
      id: 'want',
      category: 'Drive',
      question: 'What do they want more than anything?',
      field: 'motivations'
    },
    {
      id: 'need',
      category: 'Drive',
      question: 'What do they actually need, even if they do not realize it?',
      field: 'motivations'
    },
    { id: 'fear', category: 'Drive', question: 'What are they most afraid of?', field: 'fears' },
    {
      id: 'lie',
      category: 'Drive',
      question: 'What false belief about themselves or the world do they hold?',
      field: 'falseBelief'
    },
    {
      id: 'wound',
      category: 'Past',
      question: 'What event from their past still hurts?',
      field: 'backstory'
    },
    {
      id: 'childhood',
      category: 'Past',
      question: 'Describe a formative moment from their childhood.',
      field: 'backstory'
    },
    {
      id: 'secret',
      category: 'Past',
      question: 'What secret are they keeping, and from whom?',
      field: 'secrets'
    },
    {
      id: 'first-impression',
      category: 'Surface',
      question: 'What do people notice first when they walk into a room?',
      field: 'appearance'
    },
    {
      id: 'voice',
      category: 'Surface',
      question: 'How do they talk? Any phrases they overuse?',
      field: 'voice'
    },
    {
      id: 'possession',
      category: 'Surface',
      question: 'What object would they run back into a burning building for?',
      field: 'treasuredPossession'
    },
    {
      id: 'betrayal',
      category: 'Relationships',
      question: 'Who would they betray, and what would it take?'
    },
    {
      id: 'trust',
      category: 'Relationships',
      question: 'Who do they trust completely? Are they right to?'
    },
    {
      id: 'bad-day',
      category: 'Scenarios',
      question: 'What does a truly bad day look like for them?'
    },
    {
      id: 'line',
      category: 'Scenarios',
      question: 'What line will they never cross? What would push them over it?',
      field: 'lines'
    },
    {
      id: 'emotional-tell',
      category: 'Identity',
      question: 'What physical sign betrays an emotion they are trying to hide?',
      field: 'appearance'
    },
    {
      id: 'self-image',
      category: 'Identity',
      question: 'How does their view of themselves differ from how others see them?'
    },
    { id: 'comfort', category: 'Daily Life', question: 'What small routine helps them feel safe?' },
    {
      id: 'work',
      category: 'Daily Life',
      question: 'What work do they do well, and what do they avoid?'
    },
    {
      id: 'humor',
      category: 'Expression',
      question: 'What makes them laugh, even when they try to hide it?',
      field: 'voice'
    },
    {
      id: 'speech',
      category: 'Expression',
      question: 'How does their speech change when they are under pressure?',
      field: 'voice'
    },
    {
      id: 'keepsake',
      category: 'History',
      question: 'What ordinary possession has a private meaning nobody else would guess?',
      field: 'treasuredPossession'
    },
    {
      id: 'turning-point',
      category: 'History',
      question: 'Which past decision changed the course of their life?',
      field: 'backstory'
    },
    {
      id: 'mentor',
      category: 'Relationships',
      question: 'Who taught them something they now wish they could unlearn?'
    },
    {
      id: 'envy',
      category: 'Relationships',
      question: 'Whose life do they envy, and what are they overlooking?'
    },
    { id: 'apology', category: 'Relationships', question: 'Who deserves an apology from them?' },
    {
      id: 'success',
      category: 'Drive',
      question: 'What would success cost them that they are reluctant to give up?',
      field: 'motivations'
    },
    {
      id: 'failure',
      category: 'Scenarios',
      question: 'How do they behave after a public failure?'
    },
    {
      id: 'unexpected-kindness',
      category: 'Scenarios',
      question: 'How do they respond to kindness from someone they dislike?'
    },
    {
      id: 'change',
      category: 'Scenarios',
      question: 'What would convince them to change a deeply held belief?'
    }
  ],
  organization: [
    { id: 'purpose', category: 'Identity', question: 'What does this group claim to exist for?' },
    {
      id: 'true-goal',
      category: 'Identity',
      question: 'What does it actually pursue behind closed doors?'
    },
    { id: 'founding', category: 'History', question: 'How and why was it founded?' },
    {
      id: 'recruit',
      category: 'Membership',
      question: 'How do people join, and what does initiation look like?'
    },
    {
      id: 'leave',
      category: 'Membership',
      question: 'What happens to someone who tries to leave?'
    },
    {
      id: 'resources',
      category: 'Power',
      question: 'What does it own or control?',
      field: 'ownership'
    },
    { id: 'enemies', category: 'Power', question: 'Who opposes it, and why?' },
    { id: 'reputation', category: 'Perception', question: 'What do ordinary people say about it?' },
    {
      id: 'symbols',
      category: 'Perception',
      question: 'What symbols, colors, or uniforms identify its members?'
    },
    {
      id: 'rift',
      category: 'Conflict',
      question: 'What internal disagreement could split it apart?'
    },
    {
      id: 'daily-work',
      category: 'Membership',
      question: 'What does an ordinary day look like for a new member?'
    },
    {
      id: 'promotion',
      category: 'Membership',
      question: 'How does someone gain influence within the group?'
    },
    {
      id: 'unwritten-rule',
      category: 'Membership',
      question: 'What unwritten rule do experienced members know?'
    },
    {
      id: 'leadership-test',
      category: 'Power',
      question: 'How is a leader challenged or replaced?'
    },
    {
      id: 'dependency',
      category: 'Power',
      question: 'What outside resource could it not survive without?'
    },
    {
      id: 'funding',
      category: 'Power',
      question: 'Who pays for its activities, and what do they expect in return?'
    },
    {
      id: 'failure',
      category: 'History',
      question: 'What failure has it tried to erase from its history?'
    },
    {
      id: 'founder-myth',
      category: 'History',
      question: 'Which story about its founders is misleading?'
    },
    {
      id: 'tradition',
      category: 'Identity',
      question: 'What tradition persists after its original purpose has been forgotten?'
    },
    {
      id: 'contradiction',
      category: 'Identity',
      question: 'Where do its rules contradict its stated values?'
    },
    { id: 'ally', category: 'Conflict', question: 'Which ally does it distrust but still need?' },
    {
      id: 'crisis',
      category: 'Conflict',
      question: 'What emergency would force it to reveal its priorities?'
    },
    {
      id: 'dissent',
      category: 'Conflict',
      question: 'How does it handle criticism from its own members?'
    },
    {
      id: 'beneficiaries',
      category: 'Perception',
      question: 'Who benefits from its work without knowing it exists?'
    },
    {
      id: 'future',
      category: 'Identity',
      question: 'What would make the organization no longer necessary?'
    }
  ],
  location: [
    { id: 'senses', category: 'Atmosphere', question: 'What does it look, sound, and smell like?' },
    { id: 'mood', category: 'Atmosphere', question: 'How does a stranger feel on arrival?' },
    {
      id: 'landscape',
      category: 'Geography',
      question: 'What is the terrain and what lies beneath it?',
      field: 'geology'
    },
    {
      id: 'life',
      category: 'Geography',
      question: 'What plants and animals thrive here?',
      field: 'ecosystem'
    },
    {
      id: 'weather',
      category: 'Geography',
      question: 'What is the weather like, and how do seasons change it?'
    },
    { id: 'who-lives', category: 'People', question: 'Who lives here, and who is unwelcome?' },
    { id: 'economy', category: 'People', question: 'How do people here make a living?' },
    { id: 'landmark', category: 'Features', question: 'What landmark would appear on a postcard?' },
    {
      id: 'hidden',
      category: 'Features',
      question: 'What is hidden here that few people know about?'
    },
    { id: 'danger', category: 'Features', question: 'What makes this place dangerous?' },
    {
      id: 'past',
      category: 'History',
      question: 'What happened here that people still talk about?'
    },
    {
      id: 'arrival',
      category: 'Atmosphere',
      question: 'What is the first obstacle a visitor encounters?'
    },
    { id: 'night', category: 'Atmosphere', question: 'How does this place change after dark?' },
    {
      id: 'soundmark',
      category: 'Atmosphere',
      question: 'What recurring sound tells residents they are home?'
    },
    {
      id: 'water',
      category: 'Geography',
      question: 'Where does fresh water come from, and who controls access?'
    },
    {
      id: 'boundary',
      category: 'Geography',
      question: 'What marks the boundary between here and the next place?'
    },
    {
      id: 'seasonal-life',
      category: 'Geography',
      question: 'How does local life adapt to the harshest season?',
      field: 'ecosystem'
    },
    {
      id: 'fragile-ground',
      category: 'Geography',
      question: 'What makes the ground here unstable or valuable?',
      field: 'geology'
    },
    { id: 'gathering', category: 'People', question: 'Where do people gather to exchange news?' },
    {
      id: 'inequality',
      category: 'People',
      question: 'Who enjoys the most comfort here, and who pays for it?'
    },
    {
      id: 'hospitality',
      category: 'People',
      question: 'What does a visitor need to know to avoid giving offense?'
    },
    {
      id: 'scarcity',
      category: 'People',
      question: 'What everyday necessity is unexpectedly hard to obtain?'
    },
    {
      id: 'abandoned',
      category: 'History',
      question: 'What abandoned structure hints at an earlier way of life?'
    },
    {
      id: 'disputed-history',
      category: 'History',
      question: 'Which local event do residents remember differently?'
    },
    { id: 'escape', category: 'Features', question: 'How would someone leave in a hurry?' }
  ],
  culture: [
    {
      id: 'values',
      category: 'Beliefs',
      question: 'What does this culture value above all else?',
      field: 'values'
    },
    {
      id: 'taboo',
      category: 'Beliefs',
      question: 'What is taboo, and what happens to those who break it?'
    },
    {
      id: 'afterlife',
      category: 'Beliefs',
      question: 'What do they believe happens after death?',
      field: 'mythos'
    },
    {
      id: 'creation',
      category: 'Beliefs',
      question: 'How do they explain the origin of the world?',
      field: 'mythos'
    },
    {
      id: 'coming-of-age',
      category: 'Rituals',
      question: 'How does someone become an adult?',
      field: 'rituals'
    },
    {
      id: 'celebration',
      category: 'Rituals',
      question: 'What is their most important celebration?',
      field: 'rituals'
    },
    { id: 'greeting', category: 'Daily Life', question: 'How do people greet each other?' },
    { id: 'food', category: 'Daily Life', question: 'What is a typical meal, and who eats first?' },
    {
      id: 'languages',
      category: 'Daily Life',
      question: 'What languages or dialects do they speak?',
      field: 'languages'
    },
    { id: 'outsiders', category: 'Relations', question: 'How do they treat outsiders?' },
    {
      id: 'art',
      category: 'Expression',
      question: 'What art, music, or stories are they known for?'
    },
    {
      id: 'family',
      category: 'Daily Life',
      question: 'Who counts as family, and what obligations come with that?'
    },
    {
      id: 'home',
      category: 'Daily Life',
      question: 'What makes a dwelling feel like a proper home?'
    },
    {
      id: 'education',
      category: 'Daily Life',
      question: 'What must every child learn, and who teaches it?'
    },
    {
      id: 'leisure',
      category: 'Daily Life',
      question: 'What do people do together when no work needs doing?'
    },
    {
      id: 'disagreement',
      category: 'Relations',
      question: 'How can someone disagree respectfully with an elder?'
    },
    {
      id: 'hospitality',
      category: 'Relations',
      question: 'What does a host owe a guest, and when does that obligation end?'
    },
    {
      id: 'trade',
      category: 'Relations',
      question: 'What do neighboring cultures misunderstand about them?'
    },
    {
      id: 'mourning',
      category: 'Rituals',
      question: 'How do people mourn, and when is mourning considered complete?',
      field: 'rituals'
    },
    {
      id: 'promises',
      category: 'Rituals',
      question: 'How is a serious promise made and witnessed?',
      field: 'rituals'
    },
    {
      id: 'exception',
      category: 'Beliefs',
      question: 'When is it acceptable to break an important moral rule?',
      field: 'values'
    },
    {
      id: 'generations',
      category: 'Beliefs',
      question: 'Which value divides younger and older generations?',
      field: 'values'
    },
    {
      id: 'luck',
      category: 'Beliefs',
      question: 'What everyday signs are believed to bring good or bad fortune?',
      field: 'mythos'
    },
    {
      id: 'clothing',
      category: 'Expression',
      question: 'What does clothing communicate about a person?'
    },
    {
      id: 'change',
      category: 'Expression',
      question: 'What new custom is being adopted, and who resists it?'
    }
  ],
  species: [
    {
      id: 'traits',
      category: 'Nature',
      question: 'What sets this species apart?',
      field: 'traits',
      suggestions: SPECIES_TRAITS
    },
    {
      id: 'body',
      category: 'Biology',
      question: 'Describe their body, senses, and lifespan.',
      field: 'biology'
    },
    {
      id: 'reproduce',
      category: 'Biology',
      question: 'How do they reproduce and raise their young?',
      field: 'biology'
    },
    { id: 'diet', category: 'Biology', question: 'What do they eat, and what eats them?' },
    { id: 'weakness', category: 'Biology', question: 'What is their greatest physical weakness?' },
    {
      id: 'variants',
      category: 'Variation',
      question: 'What subtypes, breeds, or castes exist?',
      field: 'subtypes'
    },
    { id: 'society', category: 'Society', question: 'How do they organize themselves?' },
    { id: 'others', category: 'Society', question: 'How do other species see them?' },
    {
      id: 'impact',
      category: 'World',
      question: 'How has the world changed because they exist?',
      field: 'influence'
    },
    { id: 'origin', category: 'World', question: 'Where did they come from?' },
    {
      id: 'rest',
      category: 'Biology',
      question: 'How do they rest, and what happens when rest is interrupted?',
      field: 'biology'
    },
    {
      id: 'communication',
      category: 'Biology',
      question: 'How do they communicate beyond spoken language?',
      field: 'biology'
    },
    {
      id: 'healing',
      category: 'Biology',
      question: 'How do they recover from injury or illness?',
      field: 'biology'
    },
    {
      id: 'environment',
      category: 'Biology',
      question: 'What conditions allow them to thrive?',
      field: 'biology'
    },
    {
      id: 'aging',
      category: 'Biology',
      question: 'How do their abilities change as they age?',
      field: 'biology'
    },
    {
      id: 'senses-limit',
      category: 'Biology',
      question: 'What can they perceive that others cannot, and what do they miss?',
      field: 'biology'
    },
    { id: 'migration', category: 'Nature', question: 'What draws them to a new habitat?' },
    { id: 'play', category: 'Nature', question: 'What does play look like for them?' },
    {
      id: 'diversity',
      category: 'Variation',
      question: 'Which differences between individuals do outsiders overlook?'
    },
    {
      id: 'adaptation',
      category: 'Variation',
      question: 'How do populations in different habitats differ?'
    },
    {
      id: 'cooperation',
      category: 'Society',
      question: 'What makes cooperation worthwhile for them?'
    },
    {
      id: 'conflict',
      category: 'Society',
      question: 'How do they settle disputes within a group?'
    },
    {
      id: 'misconception',
      category: 'Society',
      question: 'What common belief about them is false?'
    },
    {
      id: 'symbiosis',
      category: 'World',
      question: 'What other living thing depends on them?',
      field: 'influence'
    },
    {
      id: 'pressure',
      category: 'World',
      question: 'What recent change threatens their way of life?',
      field: 'influence'
    }
  ],
  item: [
    {
      id: 'properties',
      category: 'Nature',
      question: 'What is unusual about it?',
      field: 'properties',
      suggestions: ITEM_PROPERTIES
    },
    { id: 'appearance', category: 'Nature', question: 'What does it look and feel like to hold?' },
    { id: 'maker', category: 'History', question: 'Who made it, and why?' },
    { id: 'journey', category: 'History', question: 'Whose hands has it passed through?' },
    {
      id: 'matters',
      category: 'Significance',
      question: 'Why does it matter to the story?',
      field: 'significance'
    },
    {
      id: 'want',
      category: 'Significance',
      question: 'Who wants it, and what would they do to get it?'
    },
    { id: 'cost', category: 'Significance', question: 'What does using it cost?' },
    {
      id: 'destroy',
      category: 'Significance',
      question: 'What would happen if it were destroyed?'
    },
    {
      id: 'materials',
      category: 'Nature',
      question: 'What is it made of, and where did those materials come from?'
    },
    { id: 'wear', category: 'Nature', question: 'What signs of wear reveal how it has been used?' },
    {
      id: 'recognition',
      category: 'Nature',
      question: 'How can someone distinguish it from a convincing imitation?'
    },
    {
      id: 'size',
      category: 'Nature',
      question: 'What makes it awkward to carry, store, or conceal?'
    },
    {
      id: 'sound',
      category: 'Nature',
      question: 'What sound or scent does someone associate with it?'
    },
    {
      id: 'repair',
      category: 'Use',
      question: 'How is it maintained, and who knows how to repair it?'
    },
    {
      id: 'training',
      category: 'Use',
      question: 'What must someone learn before using it safely?'
    },
    {
      id: 'limit',
      category: 'Use',
      question: 'What can it never do, despite what people believe?'
    },
    {
      id: 'misuse',
      category: 'Use',
      question: 'What unintended use could someone discover for it?'
    },
    {
      id: 'failure',
      category: 'Use',
      question: 'How does it fail, and what warning does it give?'
    },
    {
      id: 'missing-piece',
      category: 'Use',
      question: 'What does it need in order to work properly?'
    },
    { id: 'name', category: 'History', question: 'How did it acquire its name?' },
    { id: 'lost', category: 'History', question: 'When was it lost, hidden, or nearly destroyed?' },
    {
      id: 'alteration',
      category: 'History',
      question: 'What alteration has changed its original purpose?'
    },
    {
      id: 'proof',
      category: 'Significance',
      question: 'What claim could possessing it prove or disprove?',
      field: 'significance'
    },
    {
      id: 'attachment',
      category: 'Significance',
      question: 'Who values it for a reason unrelated to its usefulness?',
      field: 'significance'
    },
    {
      id: 'replacement',
      category: 'Significance',
      question: 'What would someone accept in exchange for it?'
    }
  ],
  note: [
    { id: 'core', category: 'Idea', question: 'Sum up this idea in one sentence.' },
    {
      id: 'why',
      category: 'Idea',
      question: 'Why is this interesting? What excites you about it?'
    },
    { id: 'what-if', category: 'Idea', question: 'What if the opposite were true?' },
    {
      id: 'consequence',
      category: 'Impact',
      question: 'What is the most surprising consequence of this?'
    },
    { id: 'who', category: 'Impact', question: 'Who is most affected by this?' },
    { id: 'conflict', category: 'Impact', question: 'What conflict could this create?' },
    { id: 'open', category: 'Open Questions', question: 'What do you still not know about this?' },
    {
      id: 'image',
      category: 'Idea',
      question: 'What single image captures the feeling of this idea?'
    },
    {
      id: 'question',
      category: 'Idea',
      question: 'What question makes you want to explore this further?'
    },
    { id: 'assumption', category: 'Idea', question: 'What assumption does this idea rely on?' },
    {
      id: 'scale',
      category: 'Idea',
      question: 'What changes if this happens on a much smaller or larger scale?'
    },
    {
      id: 'ordinary',
      category: 'Perspective',
      question: 'What does an ordinary day look like for someone living with this?'
    },
    {
      id: 'outsider',
      category: 'Perspective',
      question: 'What would an outsider find hardest to understand?'
    },
    {
      id: 'opponent',
      category: 'Perspective',
      question: 'Who would argue against this, and what is their strongest point?'
    },
    {
      id: 'benefit',
      category: 'Impact',
      question: 'Who gains something from this, and who loses something?'
    },
    {
      id: 'long-term',
      category: 'Impact',
      question: 'What changes after a generation has lived with this?'
    },
    {
      id: 'ripple',
      category: 'Impact',
      question: 'What unrelated part of the world could this affect?'
    },
    { id: 'cost', category: 'Impact', question: 'What hidden cost makes this more complicated?' },
    {
      id: 'first-scene',
      category: 'Story',
      question: 'What scene would let a reader discover this without an explanation?'
    },
    {
      id: 'choice',
      category: 'Story',
      question: 'What difficult choice could this force someone to make?'
    },
    {
      id: 'reversal',
      category: 'Story',
      question: 'What discovery could reverse what this seems to mean?'
    },
    {
      id: 'connection',
      category: 'Story',
      question: 'Which existing person, place, or event could connect to this?'
    },
    {
      id: 'test',
      category: 'Open Questions',
      question: 'What concrete example would help you test whether this works?'
    },
    {
      id: 'contradiction',
      category: 'Open Questions',
      question: 'Which two parts of this idea do not yet fit together?'
    },
    {
      id: 'next',
      category: 'Open Questions',
      question: 'What is the smallest part you could develop next?'
    }
  ]
};

export function getPrompts(type: EntityType): BrainstormPrompt[] {
  return BRAINSTORM_PROMPTS[type] ?? [];
}

export function getPrompt(type: EntityType, id: string): BrainstormPrompt | undefined {
  return getPrompts(type).find((p) => p.id === id);
}

export function isTagPrompt(type: EntityType, prompt: BrainstormPrompt): boolean {
  if (!prompt.field) return false;
  return ENTITY_FIELDS[type].some((f) => f.key === prompt.field && f.type === 'tags');
}

export function splitTags(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface PromptTarget {
  body: string;
  frontmatter: Record<string, unknown>;
}

export function applyPromptAnswer(
  type: EntityType,
  target: PromptTarget,
  prompt: BrainstormPrompt,
  answer: string
): Record<string, unknown> {
  const text = answer.trim();
  const answered = Array.isArray(target.frontmatter.answeredPrompts)
    ? (target.frontmatter.answeredPrompts as string[])
    : [];
  const data: Record<string, unknown> = {
    answeredPrompts: answered.includes(prompt.id) ? answered : [...answered, prompt.id]
  };

  const fieldDef = prompt.field
    ? ENTITY_FIELDS[type].find((f) => f.key === prompt.field)
    : undefined;

  if (fieldDef?.type === 'tags') {
    const existing = target.frontmatter[fieldDef.key];
    const current = Array.isArray(existing) ? (existing as string[]) : [];
    const seen = new Set(current.map((t) => t.toLowerCase()));
    const added = splitTags(text).filter((t) => {
      const key = t.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    data[fieldDef.key] = [...current, ...added];
  } else if (fieldDef?.type === 'text') {
    data[fieldDef.key] = text;
  } else if (fieldDef) {
    const existing = target.frontmatter[fieldDef.key];
    const current = typeof existing === 'string' ? existing.trim() : '';
    data[fieldDef.key] = current ? `${current}\n\n${text}` : text;
  } else {
    const current = target.body.trimEnd();
    const section = `### ${prompt.question}\n\n${text}\n`;
    data.body = current ? `${current}\n\n${section}` : section;
  }

  return data;
}
