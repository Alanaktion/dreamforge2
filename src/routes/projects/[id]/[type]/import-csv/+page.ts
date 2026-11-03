import { error, redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { entitiesPath, fieldsFor, type CustomField } from '$lib/api/entities';
import type { FieldDef } from '$lib/entityFields';
import { entityTypeToRoute, routeToEntityType } from '$lib/utils/entityTypes';
import type { PageLoad } from './$types';

/** A column the CSV can map to: the entity's own columns, then each field. */
export interface TargetField {
  key: string;
  label: string;
  type: FieldDef['type'];
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const entityType = routeToEntityType(params.type);
  if (!entityType) error(404, 'Not found');

  const data = await get<{
    customFields: CustomField[];
    projectName: string;
    role: 'owner' | 'editor' | 'commenter';
  }>(entitiesPath(params.id, entityType), fetch);
  if (data.role === 'commenter') redirect(302, `/projects/${params.id}/${params.type}`);

  const targetFields: TargetField[] = [
    { key: 'id', label: 'ID (for update matching)', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'tags', label: 'Tags', type: 'tags' },
    { key: 'status', label: 'Status', type: 'text' },
    { key: 'body', label: 'Body', type: 'markdown' },
    ...fieldsFor(entityType, data.customFields)
      .filter((f) => f.type !== 'image')
      .map((f) => ({ key: f.key, label: f.label, type: f.type }))
  ];

  return {
    entityType,
    route: entityTypeToRoute(entityType),
    projectName: data.projectName,
    role: data.role,
    targetFields
  };
};
