<script lang="ts">
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { api, ApiError, type ApiOptions } from '$lib/api';
  import type { AdminUser } from '$lib/api/types';
  import { Button } from '$lib/components/ui/button';
  import { formatDate } from '$lib/utils';

  let users = $derived((page.data.users ?? []) as AdminUser[]);
  let reset = $state<{ userId: string; password: string } | null>(null);
  let error = $state('');

  async function run(path: string, method: ApiOptions['method'], body: unknown = {}) {
    error = '';
    try {
      const result = await api(path, { method, body });
      await invalidateAll();
      return result;
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not reach the server.';
    }
  }

  async function resetPassword(userId: string) {
    const result = await run(`/api/admin/users/${userId}/reset-password`, 'POST');
    if (result) reset = result as { userId: string; password: string };
  }
</script>

<svelte:head><title>Instance admin — DreamForge</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-8 p-6">
  <div>
    <h1 class="text-2xl font-bold">Instance admin</h1>
    <p class="text-sm text-muted-foreground">Manage who can use this DreamForge server.</p>
  </div>

  {#if error}<p role="alert" class="rounded border border-destructive p-3 text-sm">
      {error}
    </p>{/if}

  <section class="rounded-lg border border-border bg-card p-4" aria-labelledby="registration">
    <h2 id="registration" class="mb-1 text-lg font-semibold">Registration</h2>
    <p class="mb-3 text-sm text-muted-foreground">
      Sign-ups are currently <strong>{page.data.registrationOpen ? 'open' : 'closed'}</strong>.
      Invite links work either way.
    </p>
    <div class="flex flex-wrap gap-2">
      {#each [['open', 'Open'], ['closed', 'Closed'], ['default', 'Use PUBLIC_ALLOW_REGISTRATION']] as [mode, label] (mode)}
        <Button
          variant={page.data.registration === mode ? 'default' : 'outline'}
          onclick={() => run('/api/admin/registration', 'PUT', { mode })}>{label}</Button
        >
      {/each}
    </div>
  </section>

  <section class="rounded-lg border border-border bg-card p-4" aria-labelledby="users">
    <h2 id="users" class="mb-3 text-lg font-semibold">Users ({users.length})</h2>
    {#if reset}
      <div role="status" class="mb-3 rounded border border-primary/50 bg-secondary p-3 text-sm">
        Temporary password for {users.find((u) => u.id === reset?.userId)?.email}:
        <code class="font-mono select-all">{reset.password}</code>. Share it privately; they must
        change it at next login. It won't be shown again.
      </div>
    {/if}
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" class="py-2 pr-3 font-medium">User</th>
            <th scope="col" class="py-2 pr-3 font-medium">Projects</th>
            <th scope="col" class="py-2 pr-3 font-medium">Joined</th>
            <th scope="col" class="py-2 pr-3 font-medium">Status</th>
            <th scope="col" class="py-2 font-medium"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {#each users as user (user.id)}
            {@const self = user.id === page.data.currentUserId}
            <tr class="border-t border-border align-top">
              <td class="py-2 pr-3">
                <div class="font-medium">{user.username}{self ? ' (you)' : ''}</div>
                <div class="text-xs text-muted-foreground">{user.email}</div>
              </td>
              <td class="py-2 pr-3 text-xs text-muted-foreground">
                {user.ownedProjects} owned · {user.sharedProjects} shared
              </td>
              <td class="py-2 pr-3 text-xs text-muted-foreground">{formatDate(user.createdAt)}</td>
              <td class="py-2 pr-3 text-xs">
                {#if user.isAdmin}<span class="mr-1 rounded bg-secondary px-1.5 py-0.5">Admin</span
                  >{/if}
                {#if user.disabled}<span class="rounded bg-destructive/20 px-1.5 py-0.5"
                    >Disabled</span
                  >{:else}<span class="text-muted-foreground">Active</span>{/if}
              </td>
              <td class="py-2">
                <div class="flex flex-wrap justify-end gap-1">
                  {#if !self}
                    <Button size="xs" variant="outline" onclick={() => resetPassword(user.id)}
                      >Reset password</Button
                    >
                    <Button
                      size="xs"
                      variant="outline"
                      onclick={() =>
                        run(`/api/admin/users/${user.id}/admin`, 'PUT', { value: !user.isAdmin })}
                      >{user.isAdmin ? 'Remove admin' : 'Make admin'}</Button
                    >
                    <Button
                      size="xs"
                      variant={user.disabled ? 'outline' : 'destructive'}
                      onclick={() =>
                        run(`/api/admin/users/${user.id}/disabled`, 'PUT', {
                          value: !user.disabled
                        })}>{user.disabled ? 'Enable' : 'Disable'}</Button
                    >
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</div>
