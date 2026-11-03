import { redirect } from '@sveltejs/kit';
import { listEntities } from '$lib/server/entities';
import { getCustomFieldDefs } from '$lib/server/customFields';
import { routeToEntityType } from '$lib/utils/entityTypes';
import { ENTITY_FIELDS, mergeFields } from '$lib/entityFields';
import { serializeCSV } from '$lib/server/csv';
import { getProjectAccess } from '$lib/server/members';

export async function GET({ params, locals }) {
  if (!locals.user) throw redirect(302, '/login');

  const entityType = routeToEntityType(params.type);
  if (!entityType) throw redirect(302, `/projects/${params.id}`);

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw redirect(302, '/projects');
  const { project } = access;

  const entities = listEntities(params.id, project.dataPath, entityType);

  const customFieldDefs = getCustomFieldDefs(params.id, entityType).map((f) => ({
    key: f.key,
    label: f.label,
    type: f.fieldType,
    entityType: f.refEntityType || undefined,
    placeholder: f.placeholder || undefined,
    required: f.required
  }));

  const allFields = mergeFields(ENTITY_FIELDS[entityType], customFieldDefs);

  const headerFields = allFields.map((f) => f.key);

  const rows = entities.map((e) => {
    const row: Record<string, unknown> = {
      id: e.id,
      name: e.name,
      type: e.type,
      tags: (e.tags || []).join(', '),
      status: e.status,
      body: e.body || ''
    };
    for (const key of headerFields) {
      row[key] = e.frontmatter?.[key] ?? '';
    }
    return row;
  });

  const csv = serializeCSV(rows);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${entityType}s.csv"`
    }
  });
}
