import { test, expect, type Page } from '@playwright/test';

const password = 'Smoke-updated-password';
async function showChapters(page: Page) {
  const phone = (page.viewportSize()?.width ?? 1024) < 768;
  if (phone && page.url().includes('scene='))
    await page.getByRole('button', { name: 'Back to chapters' }).click();
}

test('production login, awkward entities, autosave, relations and project ZIP restore', async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await page.goto('/login');
  await page.getByLabel('Email').fill('smoke@example.test');
  await page.getByLabel('Password', { exact: true }).fill('Smoke-initial-password');
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await Promise.race([
    page.waitForURL(/\/(account|projects)$/),
    page.getByText('Invalid email or password', { exact: true }).waitFor()
  ]);
  if (new URL(page.url()).pathname === '/login') {
    await page.getByLabel('Password', { exact: true }).fill(password);
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
  // Wait for the reload that opens the new scene, or the fill below races the editor remount.
  await Promise.all([
    page.waitForResponse((response) => response.url().includes('__data.json')),
    page.locator('form[action="?/createScene"] button').last().click()
  ]);
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
  const download = await page.request.get(`${project}/export`);
  expect(download.ok()).toBe(true);
  expect(download.headers()['content-type']).toContain('application/zip');
  const zip = await download.body();
  await page.goto('/projects');
  await page.getByText('Import a project', { exact: true }).click();
  await page
    .getByLabel('Import project from ZIP')
    .setInputFiles({ name: 'project.zip', mimeType: 'application/zip', buffer: zip });
  await page.getByRole('button', { name: 'Import project', exact: true }).click();
  await expect(
    page.getByRole('link', { name: `Smoke ${testInfo.project.name}`, exact: true })
  ).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('invite links, instance admin, and per-member pins', async ({ page, browser }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (cause) => errors.push(cause.message));
  await page.goto('/login');
  await page.getByLabel('Email').fill('smoke@example.test');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log In', exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);

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
