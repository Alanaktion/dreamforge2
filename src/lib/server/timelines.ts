import { readJson, writeJson } from './storage';
import fs from 'node:fs';
import path from 'node:path';
import { generateId } from '$lib/utils';

export interface CalendarConfig {
  name: string;
  months: string[];
  epoch: number;
}

export interface TimelineEvent {
  id: string;
  year: number;
  month: number | null;
  day: number | null;
  era: string;
  title: string;
  description: string;
  significance: 'major' | 'minor' | 'trivial';
  entityIds: string[];
  createdAt: string;
  modifiedAt: string;
}

export interface TimelineData {
  calendar: CalendarConfig;
  events: TimelineEvent[];
}

const DEFAULT_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

function getTimelinePath(projectPath: string): string {
  return path.join(projectPath, 'timeline.json');
}

export function loadTimeline(projectPath: string): TimelineData {
  return readJson(
    getTimelinePath(projectPath),
    {
      calendar: { name: 'Gregorian', months: [...DEFAULT_MONTHS], epoch: 0 },
      events: []
    },
    (value) =>
      !!value &&
      typeof value === 'object' &&
      Array.isArray((value as TimelineData).events) &&
      Array.isArray((value as TimelineData).calendar?.months)
  );
}

function saveTimeline(projectPath: string, data: TimelineData): void {
  fs.mkdirSync(projectPath, { recursive: true });
  writeJson(getTimelinePath(projectPath), data);
}

export function addEvent(
  projectPath: string,
  input: Omit<TimelineEvent, 'id' | 'createdAt' | 'modifiedAt'>
): TimelineEvent {
  const data = loadTimeline(projectPath);
  const now = new Date().toISOString();
  const event: TimelineEvent = {
    ...input,
    id: generateId(),
    createdAt: now,
    modifiedAt: now
  };
  data.events.push(event);
  data.events.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if ((a.month ?? 0) !== (b.month ?? 0)) return (a.month ?? 0) - (b.month ?? 0);
    return (a.day ?? 0) - (b.day ?? 0);
  });
  saveTimeline(projectPath, data);
  return event;
}

export function updateEvent(
  projectPath: string,
  eventId: string,
  updates: Partial<Omit<TimelineEvent, 'id' | 'createdAt' | 'modifiedAt'>>
): TimelineEvent | null {
  const data = loadTimeline(projectPath);
  const idx = data.events.findIndex((e) => e.id === eventId);
  if (idx === -1) return null;
  const updated: TimelineEvent = {
    ...data.events[idx],
    ...updates,
    modifiedAt: new Date().toISOString()
  };
  data.events[idx] = updated;
  data.events.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if ((a.month ?? 0) !== (b.month ?? 0)) return (a.month ?? 0) - (b.month ?? 0);
    return (a.day ?? 0) - (b.day ?? 0);
  });
  saveTimeline(projectPath, data);
  return updated;
}

export function deleteEvent(projectPath: string, eventId: string): boolean {
  const data = loadTimeline(projectPath);
  const len = data.events.length;
  data.events = data.events.filter((e) => e.id !== eventId);
  if (data.events.length === len) return false;
  saveTimeline(projectPath, data);
  return true;
}

export function updateCalendar(
  projectPath: string,
  config: Partial<CalendarConfig>
): CalendarConfig {
  const data = loadTimeline(projectPath);
  data.calendar = { ...data.calendar, ...config };
  saveTimeline(projectPath, data);
  return data.calendar;
}
