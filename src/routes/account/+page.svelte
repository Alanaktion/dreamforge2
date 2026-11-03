<script lang="ts">
  import { page } from '$app/state';
  import { goto, invalidateAll } from '$app/navigation';
  import { apiForm } from '$lib/api';
  import { Button } from '$lib/components/ui/button';

  let saved = $state(false);
  let error = $state('');
  let deleteError = $state('');
</script>

<svelte:head><title>Account — DreamForge</title></svelte:head>
<div class="mx-auto max-w-lg space-y-4 p-6">
  <h1 class="text-2xl font-bold">Account</h1>
  {#if page.data.mustChangePassword}<p>
      Change your initial administrator password before continuing.
    </p>{/if}
  <form
    use:apiForm={{
      path: '/api/account',
      method: 'PATCH',
      onresult: async (result, form) => {
        saved = result.ok;
        error = result.ok ? '' : result.error;
        if (result.ok) {
          for (const input of form.querySelectorAll('input[type=password]'))
            (input as HTMLInputElement).value = '';
          await invalidateAll();
        }
      }
    }}
    class="grid gap-4"
  >
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
  {#if error}<p role="alert">{error}</p>{/if}
  {#if saved}<p role="status">Account saved.</p>
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
      <form
        use:apiForm={{
          path: '/api/account',
          method: 'DELETE',
          onresult: async (result) => {
            if (result.ok) await goto('/login', { invalidateAll: true });
            else deleteError = result.error;
          }
        }}
        class="grid gap-3"
      >
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
    {#if deleteError}<p role="alert" class="text-sm text-destructive">
        {deleteError}
      </p>{/if}
  </section>
</div>
