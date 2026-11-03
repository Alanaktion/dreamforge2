import { error } from '@sveltejs/kit';
import { getStoryMeta, listChapters, listScenes } from '$lib/server/stories';
import { getProjectAccess } from '$lib/server/members';
import { renderMarkdown } from '$lib/server/renderMarkdown';

function renderTitlePage(title: string, subtitle?: string, author?: string) {
  return `
    <div class="title-page">
      <h1 class="story-title">${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
      ${author ? `<p class="author">by ${escapeHtml(author)}</p>` : ''}
      <p class="date">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
  `;
}

function renderToc(chapters: { title: string; scenes: { title: string | null }[] }[]) {
  const items = chapters
    .flatMap((ch, i) => {
      const scenes = ch.scenes
        .map(
          (s, j) =>
            `<li class="toc-scene">Scene ${j + 1}: ${escapeHtml(s.title || 'Untitled')}</li>`
        )
        .join('');
      return `<li class="toc-chapter">Chapter ${i + 1}: ${escapeHtml(ch.title)}<ol>${scenes}</ol></li>`;
    })
    .join('');
  return `<div class="toc"><h2>Table of Contents</h2><ol>${items}</ol></div>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface SceneRenderOptions {
  showTitles: boolean;
  showMeta: boolean;
  delimiter: string;
  isLast: boolean;
}

function renderScene(
  scene: {
    title: string | null;
    body: string;
    narrator?: string | null;
    time?: string | null;
    place?: string | null;
  },
  index: number,
  options: SceneRenderOptions
) {
  const meta = [];
  if (scene.narrator) meta.push(`Narrator: ${escapeHtml(scene.narrator)}`);
  if (scene.time) meta.push(`Time: ${escapeHtml(scene.time)}`);
  if (scene.place) meta.push(`Place: ${escapeHtml(scene.place)}`);

  const title = options.showTitles
    ? `<h3 class="scene-title">${escapeHtml(scene.title || `Scene ${index + 1}`)}</h3>`
    : '';
  const metaLine =
    options.showMeta && meta.length > 0
      ? `<p class="scene-meta">${meta.join(' &middot; ')}</p>`
      : '';
  const delimiter =
    options.isLast || !options.delimiter
      ? ''
      : `<p class="scene-delimiter">${escapeHtml(options.delimiter)}</p>`;

  return `
    <div class="scene">
      ${title}
      ${metaLine}
      <div class="scene-body">
        ${renderMarkdown(scene.body) || '<p>(empty)</p>'}
      </div>
      ${delimiter}
    </div>
  `;
}

export const GET = async ({ params, locals, url }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const access = getProjectAccess(params.id, locals.user.id);
  if (!access) throw error(404, 'Project not found');
  const { project } = access;

  const story = getStoryMeta(project.dataPath, params.storyId);
  if (!story) throw error(404, 'Story not found');

  const chapters = listChapters(project.dataPath, params.storyId);
  const chaptersWithScenes = chapters.map((ch) => ({
    ...ch,
    scenes: listScenes(project.dataPath, params.storyId, ch.id)
  }));

  const showTitlePage = url.searchParams.get('titlePage') !== 'false';
  const showToc = url.searchParams.get('toc') !== 'false';
  const titleFormat = url.searchParams.get('titleFormat') || 'chapter';
  const authorName = url.searchParams.get('author') || '';
  const showSceneTitles = url.searchParams.get('sceneTitles') !== 'false';
  const showSceneMeta = url.searchParams.get('sceneMeta') !== 'false';
  const sceneDelimiter = url.searchParams.get('delimiter') ?? '* * *';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(story.title)}</title>
<style>
  @page {
    size: letter;
    margin: 1in;
  }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 12pt;
    line-height: 1.6;
    color: #1a1a1a;
  }
  .title-page {
    text-align: center;
    padding-top: 30vh;
    page-break-after: always;
  }
  .story-title {
    font-size: 24pt;
    margin-bottom: 0.5em;
  }
  .subtitle {
    font-size: 14pt;
    color: #555;
  }
  .author {
    font-size: 14pt;
    margin-top: 2em;
  }
  .date {
    font-size: 11pt;
    color: #777;
    margin-top: 0.5em;
  }
  .toc {
    page-break-after: always;
  }
  .toc h2 {
    font-size: 18pt;
    border-bottom: 1px solid #ccc;
    padding-bottom: 0.3em;
  }
  .toc ol {
    list-style: none;
    padding: 0;
  }
  .toc-chapter {
    font-weight: bold;
    margin-top: 0.8em;
  }
  .toc-scene {
    font-weight: normal;
    padding-left: 1.5em;
    font-size: 11pt;
    color: #444;
  }
  h2.chapter-title {
    font-size: 18pt;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 0.3em;
    margin-top: 1.5em;
  }
  .scene {
    margin-top: 1.2em;
  }
  .scene-title {
    font-size: 14pt;
    font-style: italic;
    margin-bottom: 0.3em;
  }
  .scene-meta {
    font-size: 10pt;
    color: #666;
    margin-bottom: 0.8em;
  }
  .scene-body {
    text-indent: 1.5em;
  }
  .scene-body p {
    margin: 0.5em 0;
  }
  .scene-delimiter {
    text-align: center;
    color: #999;
    margin: 1.5em 0;
    font-size: 11pt;
  }
  @media screen {
    body {
      max-width: 700px;
      margin: 2em auto;
      padding: 0 1em;
    }
  }
</style>
</head>
<body>
${showTitlePage ? renderTitlePage(story.title, story.description || undefined, authorName) : ''}
${showToc ? renderToc(chaptersWithScenes) : ''}
${chaptersWithScenes
  .map(
    (ch, i) => `
  <h2 class="chapter-title">${titleFormat === 'number' ? `Chapter ${i + 1}` : escapeHtml(ch.title)}</h2>
  ${ch.scenes
    .map((s, j) =>
      renderScene(s, j, {
        showTitles: showSceneTitles,
        showMeta: showSceneMeta,
        delimiter: sceneDelimiter,
        isLast: j === ch.scenes.length - 1
      })
    )
    .join('')}
`
  )
  .join('')}
</body>
</html>`;

  const safeFilename = `${story.title.replace(/[^a-zA-Z0-9 _-]/g, '_').trim() || 'story'}-export.html`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="${safeFilename}"`
    }
  });
};
