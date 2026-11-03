import { json, error } from '@sveltejs/kit';
import { getComments, createComment, deleteComment, resolveComment } from '$lib/server/comments';
import { getProjectAccess } from '$lib/server/members';

export const GET = async ({ params, locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw error(404, 'Project not found');

  const targetType = url.searchParams.get('targetType');
  const targetId = url.searchParams.get('targetId');

  if (!targetType || !targetId) throw error(400, 'targetType and targetId are required');

  const comments = getComments(params.id, targetType, targetId);
  return json(comments);
};

export const POST = async ({ params, locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw error(404, 'Project not found');

  const body = await request.json();
  const { targetType, targetId, commentBody } = body;

  if (!targetType || !targetId || !commentBody?.trim()) {
    throw error(400, 'targetType, targetId, and commentBody are required');
  }

  const comment = createComment(
    params.id,
    targetType,
    targetId,
    locals.user.id,
    commentBody.trim()
  );
  return json(comment);
};

export const DELETE = async ({ params, locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw error(404, 'Project not found');

  const commentId = url.searchParams.get('commentId');
  if (!commentId) throw error(400, 'commentId is required');

  const ok = deleteComment(params.id, commentId, locals.user.id, access.project.userId);
  if (!ok) throw error(403, 'Cannot delete this comment');

  return json({ success: true });
};

export const PATCH = async ({ params, locals, url, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw error(404, 'Project not found');

  if (access.role === 'commenter') throw error(403, 'Insufficient permissions');

  const commentId = url.searchParams.get('commentId');
  if (!commentId) throw error(400, 'commentId is required');

  const body = await request.json();
  resolveComment(params.id, commentId, Boolean(body.resolved));

  return json({ success: true });
};
