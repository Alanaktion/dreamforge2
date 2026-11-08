import { test, expect, type BrowserContext, type Page } from '@playwright/test';

const password = 'Smoke-updated-password';
async function showChapters(page: Page) {
  const phone = (page.viewportSize()?.width ?? 1024) < 768;
  if (phone && page.url().includes('scene='))
    await page.getByRole('button', { name: 'Back to chapters' }).click();
}

// The login throttle counts every attempt (10 per 15 minutes per address), so tests reuse the
// first session they get instead of each logging in again. Tests run in one worker, in order.
let savedCookies: Awaited<ReturnType<BrowserContext['cookies']>> = [];

async function signIn(page: Page) {
  if (savedCookies.length) {
    await page.context().addCookies(savedCookies);
    await page.goto('/projects');
    if (new URL(page.url()).pathname === '/projects') return;
    await page.context().clearCookies(); // the session ended (signed out); log in again
  }
  // The first test changes the initial password. Try the changed one first, so later tests
  // don't each spend a failed attempt against the login throttle.
  await page.goto('/login');
  await page.getByLabel('Email').fill('smoke@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await Promise.race([
    page.waitForURL(/\/(account|projects)$/),
    page.getByText('Invalid email or password', { exact: true }).waitFor()
  ]);
  if (new URL(page.url()).pathname === '/login') {
    await page.getByLabel('Password', { exact: true }).fill('Smoke-initial-password');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(page).toHaveURL(/\/(account|projects)$/);
  }
  if (new URL(page.url()).pathname === '/account') {
    await expect(page).toHaveURL(/\/account/);
    await page.getByLabel('Current password').fill('Smoke-initial-password');
    await page.getByLabel('New password').fill(password);
    await page.getByRole('button', { name: 'Save account' }).click();
    await expect(page.getByText('Account saved.')).toBeVisible();
  }
  savedCookies = await page.context().cookies();
}

test('entities: awkward names, autosave, relations, bookmarks, comments, undo delete', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await signIn(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByLabel('Project Name').fill(`Entities ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const project = new URL(page.url()).pathname;

  // Names that YAML would read as something other than text must survive a round trip.
  const awkward: Record<string, string> = {
    characters: 'true',
    organizations: 'null',
    locations: '007',
    cultures: '# hash',
    species: '"Never"',
    items: '[Untitled]',
    notes: 'yes'
  };
  for (const [type, name] of Object.entries(awkward)) {
    await page.goto(`${project}/${type}`);
    const quick = page.getByRole('textbox', { name: /^Quick add/ });
    await quick.fill(name);
    await quick.press('Enter');
    await expect(quick).toHaveValue('');
    await page.reload();
    await expect(page.getByRole('main').getByText(name, { exact: true }).first()).toBeVisible();
  }

  await page.goto(`${project}/characters`);
  const quick = page.getByRole('textbox', { name: /^Quick add/ });
  await quick.fill('Vess: cynical, smuggler');
  await quick.press('Enter');
  await expect(page.getByText('Added Vess')).toBeVisible();
  await page.getByRole('main').getByText('Vess', { exact: true }).first().click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await page.getByRole('textbox', { name: 'Name' }).fill('Vess Arlen');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('Vess Arlen');

  await page.getByRole('button', { name: 'Bookmark', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unbookmark', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByText('Choose or create…').click();
  await page.getByRole('option', { name: /^true Character$/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: 'true', exact: true })).toBeVisible();

  await page.getByPlaceholder(/comment/i).fill('Check her motives.');
  await page.getByRole('button', { name: 'Post comment' }).click();
  await expect(page.getByText('Check her motives.')).toBeVisible();

  await page.goto(`${project}/characters`);
  const vess = page.getByRole('main').getByText('Vess Arlen', { exact: true });
  const row = page.locator('div.group').filter({ hasText: 'Vess Arlen' });
  await row.getByRole('button', { name: 'More actions' }).click();
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(vess).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(vess).toBeVisible();
  expect(errors).toEqual([]);
});

test('stories: autosave, edit conflicts, summaries, export, convert, trash', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await signIn(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByLabel('Project Name').fill(`Stories ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const project = new URL(page.url()).pathname;

  await page.goto(`${project}/stories`);
  await page.getByRole('button', { name: 'New Story', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Smoke story');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/stories\/[^/]+$/);
  await showChapters(page);
  await page.getByRole('button', { name: /Add Chapter/ }).click();
  await page.getByPlaceholder('Chapter title').fill('Chapter true');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByText('Chapter true', { exact: true }).click();
  await page.getByRole('button', { name: 'Add Scene' }).last().click();
  // The story opened its first scene already: wait until the new one is open, or the fill
  // below races the editor remount.
  // (CSS, not roles: on a phone the chapter list is hidden while a scene is open.)
  await expect(
    page.locator('ol[aria-label="Scenes in Chapter true"] button[aria-current="true"]')
  ).toHaveCount(1);
  const editor = page.locator('[contenteditable="true"]').first();
  await editor.fill('A scene survives production autosave.');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  await page.reload();
  await showChapters(page);
  await page.getByText('Chapter true', { exact: true }).click();
  await page.getByText('Scene 1', { exact: true }).last().click();
  await expect(editor).toContainText('A scene survives production autosave.');
  const other = await page.context().newPage();
  other.on('pageerror', (cause) => errors.push(cause.message));
  await other.goto(page.url());
  await showChapters(other);
  await other.getByText('Chapter true', { exact: true }).click();
  await other.getByText('Scene 1', { exact: true }).last().click();
  await expect(other.locator('[contenteditable="true"]').first()).toContainText(
    'A scene survives production autosave.'
  );
  await editor.fill('Updated in the first tab.');
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible();
  const otherEditor = other.locator('[contenteditable="true"]').first();
  await otherEditor.fill('My concurrent draft.');
  await expect(other.getByText(/This changed elsewhere/).first()).toBeVisible();
  await expect(otherEditor).toContainText('My concurrent draft.');
  other.on('dialog', (dialog) => dialog.accept());
  await other.getByRole('button', { name: 'Overwrite with my edits', exact: true }).click();
  await expect(other.getByText('Saved', { exact: true }).first()).toBeVisible();
  await other.reload();
  await showChapters(other);
  await other.getByText('Chapter true', { exact: true }).click();
  await other.getByText('Scene 1', { exact: true }).last().click();
  await expect(otherEditor).toContainText('My concurrent draft.');
  await other.close();
  // The first tab is now stale. Reloading in place keeps the scene open with the latest text.
  await editor.fill('A stale edit.');
  await expect(page.getByText(/This changed elsewhere/).first()).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reload latest', exact: true }).click();
  await expect(editor).toContainText('My concurrent draft.');
  await expect(page.getByText(/This changed elsewhere/)).toHaveCount(0);
  // A synopsis saved from the summaries page carries the scene revision too.
  const storyUrl = new URL(page.url());
  await page.goto(`${storyUrl.pathname}/summaries`);
  const synopsis = page.getByPlaceholder('Add a synopsis...').last();
  await synopsis.fill('A smoke synopsis.');
  await synopsis.blur();
  await expect(page.getByText('A smoke synopsis.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // The manuscript export renders the scene.
  const exported = await page.request.get(`/api${storyUrl.pathname}/export`);
  expect(exported.ok()).toBe(true);
  expect(await exported.text()).toContain('My concurrent draft.');

  // A note converts into a scene of the story.
  await page.goto(`${project}/notes`);
  const quick = page.getByRole('textbox', { name: /^Quick add/ });
  await quick.fill('Harbor idea');
  await quick.press('Enter');
  await page.getByRole('main').getByText('Harbor idea', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Convert to Scene' }).click();
  await page.getByText('Select a story...').click();
  await page.getByRole('option', { name: 'Smoke story' }).click();
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page).toHaveURL(/\/stories\/[^/]+\?scene=/);
  await expect(page.getByRole('textbox', { name: 'Scene title' })).toHaveValue('Harbor idea');

  // Deleting the story sends it to the trash, and it comes back from there.
  await page.goto(`${project}/stories`);
  await page.getByRole('button', { name: 'Delete story' }).click({ force: true });
  await expect(page.getByText('Smoke story')).toHaveCount(0);
  await page.goto(`${project}/trash`);
  await page.getByRole('button', { name: 'Restore' }).first().click();
  await expect(page.getByText('Trash is empty')).toBeVisible();
  await page.goto(`${project}/stories`);
  await expect(page.getByText('Smoke story')).toBeVisible();
  expect(errors).toEqual([]);
});

// Needs the relations page, export and import endpoints, which have not moved to
// the FastAPI backend yet. Re-enable as they are ported.
test('dashboard, writing goal, plotlines and the timeline', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  page.on('dialog', (dialog) => dialog.accept());
  await signIn(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  const name = `Plots ${testInfo.project.name}`;
  await page.getByLabel('Project Name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const project = new URL(page.url()).pathname;
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();

  // The daily goal saves from settings and shows on the dashboard.
  await page.goto(`${project}/settings`);
  await page.getByLabel('Daily word goal').fill('750');
  await page.getByLabel('Daily word goal').press('Enter');
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await page.goto(project);
  await expect(page.getByText('/ 750 words')).toBeVisible();

  await page.goto(`${project}/stories`);
  await page.getByRole('button', { name: 'New Story', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Plotted story');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/stories\/[^/]+$/);

  // A plotline from a template, with a beat linked to a scene, renamed, added and deleted.
  await page.goto(`${project}/plots`);
  await page.getByRole('button', { name: 'New Plotline' }).click();
  await page.getByLabel('Title').fill('Main arc');
  await page.getByRole('combobox').filter({ hasText: 'Select a story' }).click();
  await page.getByRole('option', { name: 'Plotted story' }).click();
  await page.locator('#template').click();
  await page.getByRole('option', { name: 'Save the Cat' }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/plots\/[^/]+$/);
  const beats = page.getByRole('list', { name: 'Plot beats' });
  await expect(beats.getByRole('listitem')).toHaveCount(15);
  await page
    .getByLabel('Linked scene for Opening Image')
    .selectOption({ label: 'Chapter 1 / Untitled' });
  await expect(page.getByText('1 of 15 linked to a scene')).toBeVisible();
  await page.getByLabel('New beat title').fill('Epilogue');
  await page.getByLabel('New beat title').press('Enter');
  await expect(beats.getByRole('listitem')).toHaveCount(16);
  await page.getByLabel('Delete Epilogue').click();
  await expect(beats.getByRole('listitem')).toHaveCount(15);
  await page.getByLabel('Plotline title').fill('Main arc, revised');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.goto(`${project}/plots`);
  await expect(page.getByText('Main arc, revised')).toBeVisible();
  await expect(page.getByText('15 beats · 1 linked to scenes')).toBeVisible();

  // Timeline: a custom calendar, an event added, edited and deleted.
  await page.goto(`${project}/timelines`);
  await page.getByRole('button', { name: 'Calendar' }).click();
  await page.getByLabel('Calendar Name').fill('Reckoning');
  await page.getByLabel('Month Names (comma-separated)').fill('Frost, Thaw');
  await page.getByRole('button', { name: 'Save Calendar' }).click();
  await expect(page.getByLabel('Calendar Name')).toBeHidden();
  await page.getByRole('button', { name: 'Add Event' }).click();
  await page.locator('#new-year').fill('412');
  await page.locator('#new-day').fill('3');
  await page.locator('#new-title').fill('The long winter');
  await page.getByRole('button', { name: 'Add Event' }).last().click();
  await expect(page.locator('p', { hasText: /^412 CE$/ })).toBeVisible();
  await page.getByRole('button', { name: 'Edit event The long winter' }).click();
  await page.locator('#edit-title').fill('The longest winter');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'The longest winter', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'The longest winter', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete event The longest winter' }).click();
  await expect(page.getByRole('button', { name: 'The longest winter', exact: true })).toHaveCount(
    0
  );

  expect(errors).toEqual([]);
});

test('images, entity image links, search and the relations page', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  page.on('dialog', (dialog) => dialog.accept());
  await signIn(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByLabel('Project Name').fill(`Images ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const project = new URL(page.url()).pathname;

  for (const [type, name] of [
    ['characters', 'Mapmaker'],
    ['organizations', 'Cartographers Guild']
  ]) {
    await page.goto(`${project}/${type}`);
    const quick = page.getByRole('textbox', { name: /^Quick add/ });
    await quick.fill(name);
    await quick.press('Enter');
    await expect(page.getByText(`Added ${name}`)).toBeVisible();
  }

  // Upload, caption, and a link to an entry from the image page.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64'
  );
  await page.goto(`${project}/images`);
  await page
    .getByLabel('Select images')
    .setInputFiles({ name: 'world-map.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Upload 1 file' }).click();
  await page.getByRole('link', { name: /world-map\.png/ }).click();
  await expect(page.getByRole('heading', { name: 'world-map.png' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'world-map.png' })).toHaveJSProperty(
    'naturalWidth',
    1
  );
  await page.getByRole('button', { name: 'Edit Details' }).click();
  await page.getByLabel('Caption').fill('The known world');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByLabel('Caption')).toBeDisabled();
  await page.reload();
  await expect(page.getByLabel('Caption')).toHaveValue('The known world');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page.getByRole('combobox').filter({ hasText: 'Select entity' }).click();
  await page.getByRole('option', { name: 'Character: Mapmaker' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('link', { name: /Mapmaker/ }).click();
  await expect(page).toHaveURL(/\/characters\/[^/]+$/);
  await expect(page.getByRole('img', { name: 'world-map.png' })).toBeVisible();
  await page.getByRole('button', { name: 'Unlink image world-map.png' }).click();
  await expect(page.getByText('No images linked to this entry.')).toBeVisible();

  // Search finds the entry by name; the type filter narrows it away.
  await page.goto(`${project}/search?q=mapmak`);
  await expect(page.getByRole('link', { name: /Mapmaker/ })).toBeVisible();
  await page.goto(`${project}/search?q=mapmak&type=organizations`);
  await expect(page.getByText(/No results for/)).toBeVisible();

  // The relations page adds and removes a relation.
  await page.goto(`${project}/relations`);
  await page.getByRole('button', { name: 'Add Relation' }).click();
  await page.getByRole('combobox').filter({ hasText: 'Select...' }).first().click();
  await page.getByRole('option', { name: /Mapmaker/ }).click();
  await page.getByRole('combobox').filter({ hasText: 'Select...' }).first().click();
  await page
    .getByRole('option', { name: /Cartographers Guild/ })
    .last()
    .click();
  await page.getByLabel('Label (optional)').fill('draws maps for');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const relations = page.getByRole('list', { name: 'Relations' });
  await expect(relations.getByText('draws maps for')).toBeVisible();
  await page.getByRole('button', { name: /^Delete relation Mapmaker/ }).click();
  await expect(relations.getByRole('listitem')).toHaveCount(0);

  // Deleting the image moves it to the trash.
  await page.goto(`${project}/images`);
  await page.getByRole('link', { name: /world-map\.png/ }).click();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page).toHaveURL(/\/images$/);
  await page.goto(`${project}/trash`);
  await expect(page.getByText('world-map.png').filter({ visible: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('production login, awkward entities, autosave, relations and project ZIP restore', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await signIn(page);
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByLabel('Project Name').fill(`Smoke ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const project = new URL(page.url()).pathname;
  const types = [
    'characters',
    'organizations',
    'locations',
    'cultures',
    'species',
    'items',
    'notes'
  ];
  for (const [i, type] of types.entries()) {
    await page.goto(`${project}/${type}`);
    const quick = page.getByRole('textbox', { name: /^Quick add/ });
    await quick.fill(['[Untitled]', 'true', 'null', '007', '# hash', '"Never"', '[note]'][i]);
    await quick.press('Enter');
    await expect(quick).toHaveValue('');
    await page.reload();
    await expect(page.getByText('Internal Error', { exact: true })).toHaveCount(0);
  }
  await page.goto(`${project}/relations`);
  await expect(page.getByText('Internal Error', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add Relation' }).click();
  const pickers = page.getByRole('combobox');
  await pickers.nth(0).click();
  await page.getByRole('option', { name: '[Untitled]', exact: true }).click();
  // Let the first picker's list close, or its options match the second picker's too.
  await expect(page.getByRole('option')).toHaveCount(0);
  await pickers.nth(1).click();
  await page.getByRole('option', { name: 'true', exact: true }).click();
  await page.getByLabel('Label (optional)').fill('Smoke relation');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByText('Smoke relation', { exact: true })).toBeVisible();
  const download = await page.request.get(`/api${project}/export`);
  expect(download.ok()).toBe(true);
  expect(download.headers()['content-type']).toContain('application/zip');
  const zip = await download.body();
  await page.goto('/projects');
  await page.getByText('Import a project', { exact: true }).click();
  await page
    .getByLabel('Import project from ZIP')
    .setInputFiles({ name: 'project.zip', mimeType: 'application/zip', buffer: zip });
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  // The import opens the new copy.
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  expect(new URL(page.url()).pathname).not.toBe(project);
  await page.goto('/projects');
  await expect(
    page.getByRole('link', { name: `Smoke ${testInfo.project.name}`, exact: true })
  ).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('starters, the sample world, CSV import and export, and backups', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await signIn(page);

  // A Novel starter comes with a story, a chapter and a story bible.
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByLabel('Project Name').fill(`Novel ${testInfo.project.name}`);
  await page.getByRole('radio', { name: /Novel/ }).check();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  const project = new URL(page.url()).pathname;
  await page.goto(`${project}/stories`);
  await expect(page.getByText('Untitled novel').filter({ visible: true }).first()).toBeVisible();
  await page.goto(`${project}/notes`);
  await expect(page.getByText('Story bible').filter({ visible: true }).first()).toBeVisible();

  // CSV: import two characters, one of them twice (the second row updates it).
  await page.goto(`${project}/characters/import-csv`);
  await page.locator('input[type=file]').setInputFiles({
    name: 'people.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,tags,age\nAda,"scout, pilot",31\nBo,,40\nada,captain,32\n')
  });
  await expect(page.getByText('Map Columns')).toBeVisible();
  await page.getByRole('button', { name: 'Import Data' }).click();
  await expect(page.getByText('Created: 2 · Updated: 1')).toBeVisible();
  const csv = await page.request.get(`/api${project}/csv/characters`);
  expect(csv.ok()).toBe(true);
  const text = await csv.text();
  expect(text).toContain('captain');
  expect(text).toContain('Bo,');

  // Backups: back up now, then the backup is listed and downloads as a ZIP.
  await page.goto(`${project}/settings`);
  await page.getByRole('button', { name: 'Back up now' }).click();
  const backup = page.locator('a[href*="/backups/backup-"]');
  await expect(backup).toHaveCount(1);
  const zip = await page.request.get((await backup.getAttribute('href')) ?? '');
  expect(zip.headers()['content-type']).toContain('application/zip');

  // The sample world opens straight into a populated project.
  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByRole('button', { name: /explore a sample world/i }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await page.goto(`${new URL(page.url()).pathname}/characters`);
  await expect(page.getByText('Maren Holt').filter({ visible: true }).first()).toBeVisible();

  expect(errors).toEqual([]);
});

test('invite links, instance admin, and per-member pins', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await signIn(page);

  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Instance admin' })).toBeVisible();
  await expect(page.getByText('smoke@example.test')).toBeVisible();

  await page.goto('/projects');
  await page.getByRole('button', { name: 'New Project', exact: true }).first().click();
  await page.getByLabel('Project Name').fill(`Shared ${testInfo.project.name}`);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/);
  await page.goto(`${new URL(page.url()).pathname}/settings`);
  await page.getByRole('button', { name: 'Create invite link' }).click();
  const link = await page.getByRole('textbox', { name: /Invite link/ }).inputValue();
  expect(link).toContain('/invite/');

  const guest = await browser.newContext();
  const other = await guest.newPage();
  other.on('pageerror', (cause) => errors.push(cause.message));
  await other.goto(link);
  await other.getByRole('link', { name: 'Create an account' }).click();
  const name = `guest${testInfo.project.name}${Date.now()}`;
  await other.getByLabel('Email').fill(`${name}@example.test`);
  await other.getByLabel('Username').fill(name);
  await other.getByLabel('Password').fill('Guest-password-1');
  await other.getByRole('button', { name: /Register|Create/ }).click();
  await other.getByRole('button', { name: 'Join project' }).click();
  await expect(other).toHaveURL(/\/projects\/[^/]+$/);
  await other.goto('/projects');
  await other.getByRole('button', { name: `Pin Shared ${testInfo.project.name}` }).click();
  await expect(
    other.getByRole('button', { name: `Unpin Shared ${testInfo.project.name}` })
  ).toBeVisible();
  await guest.close();
  expect(errors).toEqual([]);
});

test('brainstorming: optional panel, browsing, drafts, saves and revisiting', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await signIn(page);
  const headers = { origin: 'http://127.0.0.1:4173' };
  const projectResponse = await page.request.post('/api/projects', {
    headers,
    data: { name: `Brainstorm ${testInfo.project.name}` }
  });
  expect(projectResponse.ok()).toBe(true);
  const { id: projectId } = await projectResponse.json();
  const endpoint = `/api/projects/${projectId}/entities/notes`;
  const firstResponse = await page.request.post(endpoint, {
    headers,
    data: {
      name: 'A city that moves',
      fields: { answeredPrompts: ['open', 'test', 'contradiction', 'next'] }
    }
  });
  expect(firstResponse.ok()).toBe(true);
  const first = await firstResponse.json();
  const secondResponse = await page.request.post(endpoint, {
    headers,
    data: { name: 'Another idea' }
  });
  expect(secondResponse.ok()).toBe(true);
  const second = await secondResponse.json();
  const url = `/projects/${projectId}/notes/${first.id}`;
  await page.goto(url);
  const panel = page.getByRole('region', { name: 'Brainstorm', exact: true });
  const toggle = panel.getByRole('button', { name: 'Brainstorm', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('textbox')).toHaveCount(0);
  await toggle.click();
  const answer = panel.getByRole('textbox');
  await expect(answer).toHaveAccessibleName('Sum up this idea in one sentence.');
  await answer.fill('A wandering city follows the rain.');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(answer).toHaveValue('');
  await answer.fill('The streets change overnight.');
  await panel.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(answer).toHaveValue('A wandering city follows the rain.');
  await toggle.click();
  await toggle.click();
  await expect(answer).toHaveValue('A wandering city follows the rain.');
  await panel.getByRole('radio', { name: 'List', exact: true }).check();
  const questions = panel.getByRole('list', { name: 'Brainstorm questions' });
  await expect(questions.getByRole('button')).toHaveCount(25);
  await expect(questions.getByRole('button').filter({ hasText: 'Draft' })).toHaveCount(2);
  await questions.getByRole('button', { name: /Sum up this idea/ }).click();
  await expect(panel.getByRole('radio', { name: 'Card', exact: true })).toBeChecked();
  await expect(answer).toHaveValue('A wandering city follows the rain.');

  const category = panel.getByRole('button', { name: 'Prompt category' });
  await category.click();
  await page.getByRole('option', { name: 'Open Questions', exact: true }).click();
  await expect(panel.getByText('You’ve explored these questions.', { exact: false })).toBeVisible();
  await expect(answer).toHaveAccessibleName('What do you still not know about this?');
  await panel.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(answer).toHaveAccessibleName('What is the smallest part you could develop next?');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(answer).toHaveAccessibleName('What do you still not know about this?');
  await panel.getByRole('button', { name: 'Random', exact: true }).click();
  await expect(answer).not.toHaveAccessibleName('What do you still not know about this?');
  await category.click();
  await page.getByRole('option', { name: 'All categories', exact: true }).click();
  await panel.getByRole('radio', { name: 'List', exact: true }).check();
  await questions.getByRole('button', { name: /Sum up this idea/ }).click();
  await expect(answer).toHaveValue('A wandering city follows the rain.');

  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('');
  await panel.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText(
    'Save or resolve your pending edits before saving this idea.'
  );
  await expect(answer).toHaveValue('A wandering city follows the rain.');
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('A city that moves');

  await page.route(`**${endpoint}/${first.id}`, async (route) => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 409, json: { detail: 'Changed elsewhere' } });
    } else await route.continue();
  });
  await panel.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(panel.getByRole('alert')).toHaveText('Changed elsewhere');
  await expect(answer).toHaveValue('A wandering city follows the rain.');
  await page.unroute(`**${endpoint}/${first.id}`);

  let releaseSave!: () => void;
  const pendingSave = new Promise<void>((resolve) => {
    releaseSave = resolve;
  });
  await page.route(`**${endpoint}/${first.id}`, async (route) => {
    if (route.request().method() === 'PATCH') await pendingSave;
    await route.continue();
  });
  await answer.press('Control+Enter');
  await expect(panel.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
  await expect(panel.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
  await expect(category).toBeDisabled();
  releaseSave();
  await expect(answer).toHaveAccessibleName('Why is this interesting? What excites you about it?');
  await expect(answer).toHaveValue('The streets change overnight.');
  await page.unroute(`**${endpoint}/${first.id}`);
  const saved = await (await page.request.get(`${endpoint}/${first.id}/content`)).json();
  expect(saved.body).toContain('A wandering city follows the rain.');
  expect(saved.frontmatter.answeredPrompts).toContain('core');
  await panel.getByRole('radio', { name: 'List', exact: true }).check();
  await questions.getByRole('button', { name: /Sum up this idea/ }).click();
  await expect(answer).toHaveValue('');
  await expect(panel.getByText('Answered before', { exact: true })).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  await page.screenshot({
    path: `test-results/brainstorm-${testInfo.project.name}.png`,
    fullPage: true
  });
  await page.goto(`/projects/${projectId}/notes`);
  await page.getByRole('main').getByText('Another idea', { exact: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/notes/${second.id}$`));
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(answer).toHaveValue('');
  await expect(category).toHaveText('All categories');
  const characterEndpoint = `/api/projects/${projectId}/entities/characters`;
  const characterResponse = await page.request.post(characterEndpoint, {
    headers,
    data: { name: 'The rainkeeper' }
  });
  expect(characterResponse.ok()).toBe(true);
  const character = await characterResponse.json();
  await page.goto(`/projects/${projectId}/characters/${character.id}`);
  await toggle.click();
  await panel.getByRole('button', { name: 'loyal', exact: true }).click();
  await answer.fill('observant');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await panel.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'loyal', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(answer).toHaveValue('observant');
  await panel.getByRole('button', { name: 'Roll 3', exact: true }).click();
  await expect(panel.locator('button[aria-pressed="true"]')).toHaveCount(4);
  await panel.getByRole('button', { name: 'Save answer', exact: true }).click();
  await expect(answer).toHaveAccessibleName('What flaws get them into trouble?');
  const savedCharacter = await (
    await page.request.get(`${characterEndpoint}/${character.id}/content`)
  ).json();
  expect(savedCharacter.frontmatter.virtues).toContain('loyal');
  expect(savedCharacter.frontmatter.virtues).toContain('observant');
  expect(savedCharacter.frontmatter.virtues).toHaveLength(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true
  );
  expect(errors).toEqual([]);
});
