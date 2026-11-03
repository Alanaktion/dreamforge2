<script lang="ts">
  import { page } from '$app/state';
  import { enhance } from '$app/forms';
  import { Button } from '$lib/components/ui/button';
  import { formatDate } from '$lib/utils';

  interface UserRow {
    id: string;
    email: string;
    username: string;
    isAdmin: boolean;
    disabled: boolean;
    createdAt: string;
    ownedProjects: number;
    sharedProjects: number;
  }

  let users = $derived((page.data.users ?? []) as UserRow[]);
  let reset = $derived(page.form?.reset as { userId: string; password: string } | undefined);
</script>

<svelte:head><title>Instance admin — DreamForge</title></svelte:head>

<div class="mx-auto max-w-5xl space-y-8 p-6">
  <div>
    <h1 class="text-2xl font-bold">Instance admin</h1>
    <p class="text-sm text-muted-foreground">Manage who can use this DreamForge server.</p>
  </div>

  {#if page.form?.error}<p role="alert" class="rounded border border-destructive p-3 text-sm">
      {page.form.error}
    </p>{/if}

  <section class="rounded-lg border border-border bg-card p-4" aria-labelledby="registration">
    <h2 id="registration" class="mb-1 text-lg font-semibold">Registration</h2>
    <p class="mb-3 text-sm text-muted-foreground">
      Sign-ups are currently <strong>{page.data.registrationOpen ? 'open' : 'closed'}</strong>.
      Invite links work either way.
    </p>
    <form method="POST" action="?/registration" use:enhance class="flex flex-wrap gap-2">
      <Button
        type="submit"
        name="mode"
        value="open"
        variant={page.data.registration === 'open' ? 'default' : 'outline'}>Open</Button
      >
      <Button
        type="submit"
        name="mode"
        value="closed"
        variant={page.data.registration === 'closed' ? 'default' : 'outline'}>Closed</Button
      >
      <Button
        type="submit"
        name="mode"
        value="default"
        variant={page.data.registration === 'default' ? 'default' : 'outline'}
        >Use PUBLIC_ALLOW_REGISTRATION</Button
      >
    </form>
  </section>

  <section class="rounded-lg border border-border bg-card p-4" aria-labelledby="users">
    <h2 id="users" class="mb-3 text-lg font-semibold">Users ({users.length})</h2>
    {#if reset}
      <div role="status" class="mb-3 rounded border border-primary/50 bg-secondary p-3 text-sm">
        Temporary password for {users.find((u) => u.id === reset.userId)?.email}:
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
                    <form method="POST" action="?/resetPassword" use:enhance>
                      <input type="hidden" name="userId" value={user.id} />
                      <Button type="submit" size="xs" variant="outline">Reset password</Button>
                    </form>
                    <form method="POST" action="?/admin" use:enhance>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="admin" value={String(!user.isAdmin)} />
                      <Button type="submit" size="xs" variant="outline"
                        >{user.isAdmin ? 'Remove admin' : 'Make admin'}</Button
                      >
                    </form>
                    <form method="POST" action="?/disable" use:enhance>
                      <input type="hidden" name="userId" value={user.id} />
                      <input type="hidden" name="disabled" value={String(!user.disabled)} />
                      <Button
                        type="submit"
                        size="xs"
                        variant={user.disabled ? 'outline' : 'destructive'}
                        >{user.disabled ? 'Enable' : 'Disable'}</Button
                      >
                    </form>
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
