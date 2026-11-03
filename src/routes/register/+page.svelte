<script lang="ts">
  import { goto } from '$app/navigation';
  import { apiForm } from '$lib/api';
  import type { AuthResult } from '$lib/api/types';
  import { page } from '$app/state';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Label } from '$lib/components/ui/label';

  let email = $state('');
  let username = $state('');
  let password = $state('');
  let error = $state('');
</script>

<svelte:head>
  <title>Register — DreamForge</title>
</svelte:head>

<div class="flex min-h-screen items-center justify-center">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center">
      <h1 class="text-2xl font-bold">Register</h1>
      <p class="mt-1 text-sm text-muted-foreground">Create your DreamForge account</p>
    </div>

    <form
      use:apiForm={{
        path: '/api/auth/register',
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
        <Label for="username">Username</Label>
        <Input id="username" name="username" type="text" required bind:value={username} />
      </div>

      <div class="space-y-1.5">
        <Label for="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minlength={8}
          bind:value={password}
        />
      </div>

      <Button type="submit" class="w-full">Register</Button>
      {#if page.data?.invite}<input type="hidden" name="invite" value={page.data.invite} />{/if}
    </form>

    <p class="text-center text-sm text-muted-foreground">
      Already have an account?
      <a href="/login" class="text-primary hover:underline">Log in</a>
    </p>
  </div>
</div>
