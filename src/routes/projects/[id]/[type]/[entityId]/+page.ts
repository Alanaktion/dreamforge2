import { error, redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { entityPath, fieldsFor, type CustomField, type Entity } from '$lib/api/entities';
import type { EntitySummary } from '$lib/api/entities';
import type { Backlink } from '$lib/types';
import { routeToEntityType } from '$lib/utils/entityTypes';
import type { PageLoad } from './$types';

interface EntityDetail {
  entity: Entity;
  customFields: CustomField[];
  index: EntitySummary[];
  bookmarked: boolean;
  backlinks: Backlink[];
  relations: Array<{
    id: string;
    outgoing: boolean;
    relationType: string;
    label: string | null;
    otherId: string;
    otherName: string;
    otherType: EntitySummary['type'] | null;
  }>;
  projectName: string;
  projectOwnerId: string;
  role: 'owner' | 'editor' | 'commenter';
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const entityType = routeToEntityType(params.type);
  if (!entityType) error(404, 'Not found');

  const data = await get<EntityDetail>(entityPath(params.id, entityType, params.entityId), fetch);
  return {
    entity: data.entity,
    projectName: data.projectName,
    entityType,
    bookmarked: data.bookmarked,
    // Story targets for "Convert to Scene" and image links arrive with those ports.
    stories: [] as Array<{ id: string; title: string; chapters: { id: string; title: string }[] }>,
    customFields: fieldsFor(entityType, data.customFields),
    backlinks: data.backlinks,
    relations: data.relations,
    entityImages: [] as Array<{ id: string; url: string; altText?: string; originalName: string }>,
    projectImages: [] as Array<{ id: string; filename: string; originalName: string }>,
    entities: data.index,
    role: data.role,
    currentUserId: user.id,
    projectOwnerId: data.projectOwnerId
  };
};
