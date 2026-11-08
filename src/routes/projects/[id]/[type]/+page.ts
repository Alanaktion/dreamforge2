import { error, redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { entitiesPath, fieldsFor, type CustomField, type Entity } from '$lib/api/entities';
import type { EntitySummary } from '$lib/api/entities';
import { getNoteTemplates } from '$lib/noteTemplates';
import { routeToEntityType } from '$lib/utils/entityTypes';
import type { PageLoad } from './$types';

interface EntityList {
  entities: Entity[];
  customFields: CustomField[];
  index: EntitySummary[];
  projectName: string;
  role: 'owner' | 'editor' | 'commenter';
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const entityType = routeToEntityType(params.type);
  if (!entityType) error(404, 'Not found');

  const data = await get<EntityList>(entitiesPath(params.id, entityType), fetch);
  const customFields = fieldsFor(entityType, data.customFields);

  // Options for inline entityRef editing in the grid, keyed by referenced entity type.
  const refEntities: Record<
    string,
    { id: string; name: string; primaryImageUrl?: string | null }[]
  > = {};
  for (const field of customFields) {
    if (field.type !== 'entityRef' || !field.entityType || refEntities[field.entityType]) continue;
    refEntities[field.entityType] = data.index
      .filter((e) => e.type === field.entityType)
      .map((e) => ({ id: e.id, name: e.name, primaryImageUrl: e.primaryImageUrl }));
  }

  return {
    entities: data.entities,
    refEntities,
    entityType,
    projectName: data.projectName,
    templates: entityType === 'note' ? getNoteTemplates() : [],
    customFields,
    role: data.role
  };
};
