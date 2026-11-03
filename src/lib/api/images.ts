// Project images over the API (backend/src/dreamforge_api/routers/images.py).
import { api, ApiError } from '$lib/api';

export interface LinkedEntity {
  id: string;
  name: string;
  type: string;
}

export interface ProjectImage {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  caption: string | null;
  altText: string | null;
  createdAt: string;
  url: string;
  linkedEntities: LinkedEntity[];
}

export const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.gif,.webp,.svg';

export const imagesPath = (projectId: string) => `/api/projects/${projectId}/images`;
const imagePath = (projectId: string, imageId: string) =>
  `${imagesPath(projectId)}/${encodeURIComponent(imageId)}`;

/** Uploads one file: its bytes as the body, its name in the query string. */
export async function uploadImage(projectId: string, file: File): Promise<ProjectImage> {
  const response = await fetch(`${imagesPath(projectId)}?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/octet-stream' },
    body: file
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (payload as { detail?: unknown } | null)?.detail;
    throw new ApiError(
      response.status,
      typeof detail === 'string' ? detail : `Could not upload ${file.name}`
    );
  }
  return payload as ProjectImage;
}

export function updateImage(
  projectId: string,
  imageId: string,
  changes: { caption?: string; altText?: string }
) {
  return api<ProjectImage>(imagePath(projectId, imageId), { method: 'PATCH', body: changes });
}

export function deleteImage(projectId: string, imageId: string) {
  return api(imagePath(projectId, imageId), { method: 'DELETE' });
}

export function linkImage(projectId: string, imageId: string, entityId: string) {
  return api(`${imagePath(projectId, imageId)}/links/${encodeURIComponent(entityId)}`, {
    method: 'PUT'
  });
}

export function unlinkImage(projectId: string, imageId: string, entityId: string) {
  return api(`${imagePath(projectId, imageId)}/links/${encodeURIComponent(entityId)}`, {
    method: 'DELETE'
  });
}
