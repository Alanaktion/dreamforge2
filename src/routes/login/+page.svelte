<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiForm } from '$lib/api';
  import type { AuthResult } from '$lib/api/types';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  let email = $state('');
  let password = $state('');
  let error = $state('');
</script>

<svelte:head>
  <title>Log In — DreamForge</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold">Log In</h1>
      <p class="mt-1 text-sm text-muted-foreground">Welcome back to DreamForge</p>
    </div>

    <form
      use:apiForm={{
        path: '/api/auth/login',
        onresult: async (result) => {
          if (result.ok) await goto((result.data as AuthResult).redirect, { invalidateAll: true });
          else error = result.error;
        }
      }}
      class="space-y-4"
    >
      {#if error}
        <div
          class="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      {/if}

      <div class="space-y-1.5">
        <Label for="email">Email</Label>
        <Input id="email" name="email" type="email" required bind:value={email} />
      </div>

      <div class="space-y-1.5">
        <Label for="password">Password</Label>
        <Input id="password" name="password" type="password" required bind:value={password} />
      </div>

      <input type="hidden" name="next" value={page.url.searchParams.get('next') ?? ''} />
      <Button type="submit" class="w-full">Log In</Button>
    </form>

    {#if page.url.searchParams.get('invite')}
      <p class="text-center text-sm text-muted-foreground">
        New here?
        <a
          href="/register?invite={encodeURIComponent(page.url.searchParams.get('invite') ?? '')}"
          class="text-primary hover:underline">Create an account to join</a
        >
      </p>
    {:else if page.data?.allowRegistration}
      <p class="text-center text-sm text-muted-foreground">
        Don't have an account?
        <a href="/register" class="text-primary hover:underline">Register</a>
      </p>
    {/if}
  </div>
</div>
