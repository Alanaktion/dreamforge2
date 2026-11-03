<script lang="ts">
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';

  let token = $derived(page.params.token ?? '');
  let invite = $derived(
    page.data.invite as { projectName: string; role: string; projectId: string } | null
  );
</script>

<svelte:head><title>Project invite — DreamForge</title></svelte:head>

<div class="flex min-h-full items-center justify-center p-6">
  <div class="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-6 text-center">
    {#if !invite}
      <h1 class="text-xl font-semibold">This invite isn't valid</h1>
      <p class="text-sm text-muted-foreground">
        The link has expired or was revoked. Ask the project owner for a new one.
      </p>
      <Button href="/projects" variant="outline">Go to projects</Button>
    {:else}
      <h1 class="text-xl font-semibold">Join {invite.projectName}</h1>
      <p class="text-sm text-muted-foreground">
        You've been invited as {invite.role === 'editor' ? 'an editor' : 'a commenter'}.
        {invite.role === 'editor'
          ? 'Editors can read and change everything in the project.'
          : 'Commenters can read the project and leave comments.'}
      </p>
      {#if page.data.alreadyMember}
        <Button href="/projects/{invite.projectId}">Open project</Button>
      {:else if page.data.user}
        <form method="POST" action="?/accept">
          <Button type="submit" class="w-full">Join project</Button>
        </form>
        <p class="text-xs text-muted-foreground">Signed in as {page.data.user.email}</p>
      {:else}
        <div class="flex flex-col gap-2">
          <Button
            href="/login?next={encodeURIComponent(`/invite/${token}`)}&invite={encodeURIComponent(
              token
            )}">Log in to join</Button
          >
          <Button href="/register?invite={encodeURIComponent(token)}" variant="outline"
            >Create an account</Button
          >
        </div>
      {/if}
      {#if page.form?.error}<p role="alert" class="text-sm text-destructive">
          {page.form.error}
        </p>{/if}
    {/if}
  </div>
</div>
