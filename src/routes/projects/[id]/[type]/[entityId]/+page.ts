import { error, redirect } from '@sveltejs/kit';
import { load as get } from '$lib/api';
import { entityPath, fieldsFor, type CustomField, type Entity } from '$lib/api/entities';
import type { EntitySummary } from '$lib/api/entities';
import type { ProjectImage } from '$lib/api/images';
import type { Backlink } from '$lib/types';
import { routeToEntityType } from '$lib/utils/entityTypes';
import type { PageLoad } from './$types';

interface EntityDetail {
  entity: Entity;
  customFields: CustomField[];
  index: EntitySummary[];
  bookmarked: boolean;
  backlinks: Backlink[];
  images: ProjectImage[];
  projectImages: Array<{
    id: string;
    filename: string;
    originalName: string;
    altText: string | null;
  }>;
  relations: Array<{
    id: string;
    outgoing: boolean;
    relationType: string;
    label: string | null;
    otherId: string;
    otherName: string;
    primaryImageUrl?: string | null;
    otherType: EntitySummary['type'] | null;
  }>;
  projectName: string;
  projectOwnerId: string;
  role: 'owner' | 'editor' | 'commenter';
}

interface ConvertTarget {
  id: string;
  title: string;
  chapters: Array<{ id: string; title: string }>;
}

export const load: PageLoad = async ({ fetch, params, parent }) => {
  const { user } = await parent();
  if (!user) redirect(302, '/login');
  const entityType = routeToEntityType(params.type);
  if (!entityType) error(404, 'Not found');

  const [data, stories] = await Promise.all([
    get<EntityDetail>(entityPath(params.id, entityType, params.entityId), fetch),
    entityType === 'note'
      ? get<ConvertTarget[]>(`/api/projects/${params.id}/convert-targets`, fetch)
      : []
  ]);
  return {
    entity: data.entity,
    projectName: data.projectName,
    entityType,
    bookmarked: data.bookmarked,
    // Where "Convert to Scene" can put a note.
    stories,
    customFields: fieldsFor(entityType, data.customFields),
    backlinks: data.backlinks,
    relations: data.relations,
    entityImages: data.images,
    projectImages: data.projectImages,
    entities: data.index,
    role: data.role,
    currentUserId: user.id,
    projectOwnerId: data.projectOwnerId
  };
};
