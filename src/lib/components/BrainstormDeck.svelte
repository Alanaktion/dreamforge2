<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { ApiError } from '$lib/api';
  import { answerPrompt } from '$lib/api/entities';
  import { Lightbulb, Shuffle, SkipForward, Dices, ChevronDown, ChevronUp } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Input } from '$lib/components/ui/input';
  import { getPrompts, isTagPrompt, splitTags, type BrainstormPrompt } from '$lib/brainstorm';
  import { ENTITY_FIELDS } from '$lib/entityFields';
  import type { EntityType } from '$lib/types';

  interface Props {
    type: EntityType;
    answeredIds: string[];
    startOpen?: boolean;
    beforeSubmit?: () => Promise<unknown>;
  }

  let { type, answeredIds, startOpen = false, beforeSubmit }: Props = $props();

  let prompts = $derived(getPrompts(type));
  let answered = $derived(new Set(answeredIds));
  let order = $state<string[]>([]);
  let position = $state(0);
  let open = $state(untrack(() => startOpen));
  let answer = $state('');
  let picked = $state<string[]>([]);
  let saving = $state(false);
  let error = $state('');

  $effect(() => {
    order = prompts.map((p) => p.id);
    position = 0;
  });

  let byId = $derived(new Map(prompts.map((p) => [p.id, p])));
  let unanswered = $derived(order.filter((id) => !answered.has(id)));
  let queue = $derived(unanswered.length > 0 ? unanswered : order);
  let current = $derived<BrainstormPrompt | undefined>(
    queue.length > 0 ? byId.get(queue[position % queue.length]) : undefined
  );
  let tagMode = $derived(current ? isTagPrompt(type, current) : false);
  let fieldLabel = $derived(
    current?.field ? ENTITY_FIELDS[type].find((f) => f.key === current?.field)?.label : undefined
  );
  let submitValue = $derived(
    tagMode ? [...picked, ...splitTags(answer)].join(', ') : answer.trim()
  );

  function resetInput() {
    answer = '';
    picked = [];
    error = '';
  }

  function skip() {
    resetInput();
    position = (position + 1) % Math.max(queue.length, 1);
  }

  function shuffle() {
    let next = [...order];
    for (let i = next.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    order = next;
    position = 0;
    resetInput();
  }

  function togglePick(value: string) {
    picked = picked.includes(value) ? picked.filter((p) => p !== value) : [...picked, value];
  }

  function roll() {
    let pool = (current?.suggestions || []).filter((s) => !picked.includes(s));
    let chosen: string[] = [];
    while (chosen.length < 3 && pool.length > 0) {
      chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    picked = [...picked, ...chosen];
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!submitValue || !current) return;
    saving = true;
    error = '';
    try {
      await beforeSubmit?.();
      await answerPrompt(page.params.id!, type, page.params.entityId!, current.id, submitValue);
      resetInput();
      if (unanswered.length === 0) position = (position + 1) % queue.length;
      await invalidateAll();
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not save answer';
    } finally {
      saving = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }
</script>

{#if prompts.length > 0}
  <div class="mt-6 rounded-lg border border-border bg-card p-4">
    <button
      type="button"
      class="flex w-full items-center justify-between text-left"
      onclick={() => (open = !open)}
      aria-expanded={open}
    >
      <h2 class="flex items-center gap-2 text-sm font-medium">
        <Lightbulb class="h-4 w-4" />
        Brainstorm
        <span class="text-xs text-muted-foreground">
          ({prompts.filter((p) => answered.has(p.id)).length}/{prompts.length} answered)
        </span>
      </h2>
      {#if open}
        <ChevronUp class="h-4 w-4 text-muted-foreground" />
      {:else}
        <ChevronDown class="h-4 w-4 text-muted-foreground" />
      {/if}
    </button>

    {#if open && current}
      <form class="mt-3 space-y-3" onsubmit={submit}>
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="rounded bg-secondary px-1.5 py-0.5">{current.category}</span>
          {#if answered.has(current.id)}
            <span>answered before</span>
          {/if}
          <span class="ml-auto">
            saves to {fieldLabel ?? 'content'}
          </span>
        </div>

        <p class="text-base font-medium">{current.question}</p>

        {#if tagMode}
          {#if current.suggestions?.length}
            <div class="flex flex-wrap gap-1.5">
              {#each current.suggestions as suggestion (suggestion)}
                <button
                  type="button"
                  class="rounded-full border px-2.5 py-0.5 text-xs transition-colors {picked.includes(
                    suggestion
                  )
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-secondary'}"
                  onclick={() => togglePick(suggestion)}
                >
                  {suggestion}
                </button>
              {/each}
            </div>
          {/if}
          <Input
            bind:value={answer}
            onkeydown={onKeydown}
            placeholder="Add your own, comma separated"
          />
        {:else}
          <Textarea
            bind:value={answer}
            onkeydown={onKeydown}
            class="min-h-24"
            placeholder="Write whatever comes to mind…"
          />
        {/if}

        {#if error}
          <p class="text-xs text-destructive">{error}</p>
        {/if}

        <div class="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={!submitValue || saving}>Save answer</Button>
          <Button type="button" size="sm" variant="outline" onclick={skip}>
            <SkipForward class="h-3 w-3" />
            Skip
          </Button>
          {#if tagMode && current.suggestions?.length}
            <Button type="button" size="sm" variant="outline" onclick={roll}>
              <Dices class="h-3 w-3" />
              Roll 3
            </Button>
          {/if}
          <Button type="button" size="sm" variant="ghost" onclick={shuffle}>
            <Shuffle class="h-3 w-3" />
            Shuffle
          </Button>
          <span class="ml-auto text-xs text-muted-foreground">
            {#if unanswered.length === 0}
              All answered — revisiting
            {:else}
              {unanswered.length} left
            {/if}
          </span>
        </div>
      </form>
    {/if}
  </div>
{/if}
