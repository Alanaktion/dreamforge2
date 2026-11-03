export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  body: string;
}

export const NOTE_TEMPLATES: Record<string, NoteTemplate> = {
  'character-profile': {
    id: 'character-profile',
    name: 'Character Profile',
    description: 'Detailed character sheet with backstory and personality',
    body: `## Basic Information

**Full Name:**
**Age:**
**Gender:**
**Occupation:**
**Place of Origin:**
**Current Residence:**

## Appearance

Describe the character's physical appearance, distinctive features, and typical attire.

## Personality

Describe personality traits, quirks, habits, and behavioral patterns.

## Backstory

Outline the character's history, formative experiences, and key life events.

## Goals & Motivations

What does this character want? What drives them?

## Relationships

Connections to other characters, organizations, or locations.

## Abilities & Skills

Notable talents, training, or special abilities.

## Notes

Any additional details or ideas.
`
  },
  'location-description': {
    id: 'location-description',
    name: 'Location Description',
    description: 'Geography, atmosphere, and notable features of a place',
    body: `## Overview

General description of the location, its purpose, and significance.

## Geography & Climate

Terrain, weather patterns, and natural features.

## Atmosphere

What does it feel like to be here? Sounds, smells, sights, and mood.

## Notable Features

Distinctive landmarks, architecture, or points of interest.

## Inhabitants

Who lives here or frequents this place?

## History

Key historical events associated with this location.

## Notes

Any additional details.
`
  },
  'scene-outline': {
    id: 'scene-outline',
    name: 'Scene Outline',
    description: 'Plan a scene with setup, conflict, and resolution',
    body: `## Setting

**Time:**
**Place:**
**Mood/Atmosphere:**

## Characters Present

List the characters in this scene.

## Goal

What is this scene meant to accomplish?

## Summary

Brief overview of the scene.

## Key Moments

- Opening:
- Conflict/Tension:
- Turning Point:
- Resolution:

## Notes

Any additional details or ideas.
`
  },
  'chapter-plan': {
    id: 'chapter-plan',
    name: 'Chapter Plan',
    description: 'Outline a chapter with scene-by-scene breakdown',
    body: `## Chapter Overview

**Working Title:**
**POV Character:**
**Timeframe:**
**Locations:**

## Scenes

### Scene 1
- **Setting:**
- **Characters:**
- **Purpose:**
- **Summary:**

### Scene 2
- **Setting:**
- **Characters:**
- **Purpose:**
- **Summary:**

### Scene 3
- **Setting:**
- **Characters:**
- **Purpose:**
- **Summary:**

## Chapter Notes

Themes, symbolism, or notes on continuity.

## Questions to Resolve

- What needs to happen before the next chapter?
- What loose ends should be addressed?
`
  },
  'worldbuilding-note': {
    id: 'worldbuilding-note',
    name: 'Worldbuilding Note',
    description: 'Capture a worldbuilding idea, rule, or concept',
    body: `## Concept

What is this worldbuilding element?

## Rules / Mechanics

How does it work? What are the limitations or constraints?

## Impact on World

How does this element affect society, culture, or history?

## Inspiration

References, real-world parallels, or media that inspired this idea.

## Questions

Open questions or aspects to develop further.

## Notes

Any additional thoughts.
`
  }
};

export function getNoteTemplates(): NoteTemplate[] {
  return Object.values(NOTE_TEMPLATES);
}

export function getNoteTemplate(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES[id];
}
