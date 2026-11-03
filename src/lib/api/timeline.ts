// The project timeline over the API (backend/src/dreamforge_api/routers/timelines.py).
import { api } from '$lib/api';

export type Significance = 'major' | 'minor' | 'trivial';

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
  significance: Significance;
  entityIds: string[];
  createdAt: string;
  modifiedAt: string;
}

export type EventFields = Pick<
  TimelineEvent,
  'year' | 'month' | 'day' | 'era' | 'title' | 'description' | 'significance' | 'entityIds'
>;

export const timelinePath = (projectId: string) => `/api/projects/${projectId}/timeline`;
const eventPath = (projectId: string, eventId: string) =>
  `${timelinePath(projectId)}/events/${encodeURIComponent(eventId)}`;

export function createEvent(projectId: string, fields: EventFields) {
  return api<TimelineEvent>(`${timelinePath(projectId)}/events`, { method: 'POST', body: fields });
}

export function updateEvent(projectId: string, eventId: string, changes: Partial<EventFields>) {
  return api<TimelineEvent>(eventPath(projectId, eventId), { method: 'PATCH', body: changes });
}

export function deleteEvent(projectId: string, eventId: string) {
  return api(eventPath(projectId, eventId), { method: 'DELETE' });
}

export function updateCalendar(projectId: string, name: string, months: string[]) {
  return api<CalendarConfig>(`${timelinePath(projectId)}/calendar`, {
    method: 'PUT',
    body: { name, months }
  });
}
