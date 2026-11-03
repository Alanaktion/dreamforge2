<script lang="ts">
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
</script>

<svelte:head><title>Account — DreamForge</title></svelte:head>
<div class="mx-auto max-w-lg space-y-4 p-6">
  <h1 class="text-2xl font-bold">Account</h1>
  {#if page.data.mustChangePassword}<p>
      Change your initial administrator password before continuing.
    </p>{/if}
  <form method="POST" action="?/update" use:enhance class="grid gap-4">
    <label
      >Email <input
        class="w-full rounded border p-2"
        type="email"
        name="email"
        value={page.data.user?.email}
        required
      /></label
    >
    <label
      >Username <input
        class="w-full rounded border p-2"
        name="username"
        value={page.data.user?.username}
        required
      /></label
    >
    <label
      >Current password <input
        class="w-full rounded border p-2"
        type="password"
        name="currentPassword"
        autocomplete="current-password"
        required
      /></label
    >
    <label
      >New password <input
        class="w-full rounded border p-2"
        type="password"
        name="password"
        autocomplete="new-password"
        minlength="12"
        required={page.data.mustChangePassword}
      /></label
    >
    <label><input type="checkbox" name="logoutOthers" /> Log out other sessions</label>
    <Button type="submit">Save account</Button>
  </form>
  {#if page.form?.error}<p role="alert">{page.form.error}</p>{/if}
  {#if page.form?.success}<p role="status">Account saved.</p>
    <a href="/projects">Continue to projects</a>{/if}

  <section class="mt-8 space-y-3 rounded-lg border border-destructive/50 p-4">
    <h2 class="text-lg font-semibold text-destructive">Delete account</h2>
    {#if (page.data.ownedProjects ?? []).length > 0}
      <p class="text-sm">
        You own {page.data.ownedProjects.length}
        {page.data.ownedProjects.length === 1 ? 'project' : 'projects'} ({page.data.ownedProjects.join(
          ', '
        )}). Export and delete them from their Settings pages before deleting your account.
      </p>
    {:else}
      <p class="text-sm text-muted-foreground">
        This removes your login, your memberships in shared projects, and your comments. It can't be
        undone.
      </p>
      <form method="POST" action="?/delete" use:enhance class="grid gap-3">
        <label
          >Password <input
            class="w-full rounded border p-2"
            type="password"
            name="password"
            autocomplete="current-password"
            required
          /></label
        >
        <label
          >Type DELETE to confirm <input
            class="w-full rounded border p-2"
            name="confirm"
            autocomplete="off"
            required
          /></label
        >
        <Button type="submit" variant="destructive">Delete my account</Button>
      </form>
    {/if}
    {#if page.form?.deleteError}<p role="alert" class="text-sm text-destructive">
        {page.form.deleteError}
      </p>{/if}
  </section>
</div>
