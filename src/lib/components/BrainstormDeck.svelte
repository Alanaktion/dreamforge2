<script lang="ts">
  import { untrack } from 'svelte';
  import { page } from '$app/state';
  import { invalidateAll } from '$app/navigation';
  import { ApiError } from '$lib/api';
  import { answerPrompt } from '$lib/api/entities';
  import {
    Lightbulb,
    Shuffle,
    ArrowLeft,
    ArrowRight,
    Dices,
    ChevronDown,
    ChevronUp
  } from '@lucide/svelte';
  import { Button } from '$lib/components/ui/button';
  import { Badge } from '$lib/components/ui/badge';
  import { Textarea } from '$lib/components/ui/textarea';
  import { Input } from '$lib/components/ui/input';
  import * as Select from '$lib/components/ui/select';
  import { getPrompts, isTagPrompt, splitTags } from '$lib/brainstorm';
  import { adjacentPrompt, promptQueue, randomPrompt } from '$lib/brainstormDeck';
  import { ENTITY_FIELDS } from '$lib/entityFields';
  import type { EntityType } from '$lib/types';

  interface Props {
    type: EntityType;
    answeredIds: string[];
    beforeSubmit?: () => Promise<boolean | void>;
  }

  interface Draft {
    answer: string;
    picked: string[];
  }

  let { type, answeredIds, beforeSubmit }: Props = $props();
  let prompts = $derived(getPrompts(type));
  let savedIds = $state<string[]>([]);
  let answered = $derived(new Set([...answeredIds, ...savedIds]));
  let open = $state(false);
  let view = $state('card');
  let category = $state('all');
  let selectedId = $state(untrack(() => promptQueue(prompts, answered)[0] ?? ''));
  let drafts = $state<Record<string, Draft>>({});
  let saving = $state(false);
  let error = $state('');
  let categories = $derived([
    { value: 'all', label: 'All categories' },
    ...[...new Set(prompts.map((prompt) => prompt.category))].map((value) => ({
      value,
      label: value
    }))
  ]);
  let filtered = $derived(
    prompts.filter((prompt) => category === 'all' || prompt.category === category)
  );
  let current = $derived(filtered.find((prompt) => prompt.id === selectedId));
  let draft = $derived(drafts[selectedId] ?? { answer: '', picked: [] });
  let tagMode = $derived(current ? isTagPrompt(type, current) : false);
  let fieldLabel = $derived(
    current?.field
      ? ENTITY_FIELDS[type].find((field) => field.key === current?.field)?.label
      : undefined
  );
  let submitValue = $derived(
    tagMode ? [...draft.picked, ...splitTags(draft.answer)].join(', ') : draft.answer.trim()
  );

  function selectPrompt(id: string) {
    if (saving) return;
    selectedId = id;
    error = '';
  }

  function changeCategory(value: string) {
    if (saving) return;
    category = value;
    let matches = prompts.filter((prompt) => value === 'all' || prompt.category === value);
    if (!matches.some((prompt) => prompt.id === selectedId)) {
      selectPrompt(promptQueue(matches, answered)[0] ?? '');
    }
  }

  function updateDraft(change: Partial<Draft>) {
    drafts[selectedId] = { ...draft, ...change };
  }

  function togglePick(value: string) {
    updateDraft({
      picked: draft.picked.includes(value)
        ? draft.picked.filter((pick) => pick !== value)
        : [...draft.picked, value]
    });
  }

  function roll() {
    let pool = (current?.suggestions ?? []).filter(
      (suggestion) => !draft.picked.includes(suggestion)
    );
    let chosen: string[] = [];
    while (chosen.length < 3 && pool.length) {
      chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    updateDraft({ picked: [...draft.picked, ...chosen] });
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!submitValue || !current || saving) return;
    let promptId = current.id;
    let value = submitValue;
    let projectId = page.params.id!;
    let entityId = page.params.entityId!;
    saving = true;
    error = '';
    try {
      if ((await beforeSubmit?.()) === false) {
        throw new ApiError(409, 'Save or resolve your pending edits before saving this idea.');
      }
      await answerPrompt(projectId, type, entityId, promptId, value);
      savedIds = [...savedIds, promptId];
      delete drafts[promptId];
      selectedId = adjacentPrompt(filtered, new Set([...answered, promptId]), promptId, 1);
      await invalidateAll().catch(() => {
        error = 'Your answer was saved. Reload the page to refresh the entity.';
      });
    } catch (cause) {
      error = cause instanceof ApiError ? cause.message : 'Could not save answer';
    } finally {
      saving = false;
    }
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
    }
  }
</script>

{#if prompts.length}
  <section class="rounded-lg border border-border bg-card p-4" aria-label="Brainstorm">
    <button
      type="button"
      class="flex w-full items-center justify-between text-left text-sm text-muted-foreground"
      onclick={() => (open = !open)}
      aria-expanded={open}
    >
      <span class="flex items-center gap-2"><Lightbulb class="size-4" />Brainstorm</span>
      {#if open}<ChevronUp class="size-4" />{:else}<ChevronDown class="size-4" />{/if}
    </button>

    {#if open}
      <div class="mt-3 flex flex-col gap-3">
        <p class="text-xs text-muted-foreground">
          Stuck? Try a question, or skip around until something sparks an idea.
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <Select.Root
            type="single"
            value={category}
            onValueChange={changeCategory}
            items={categories}
            disabled={saving}
          >
            <Select.Trigger aria-label="Prompt category"
              ><Select.Value placeholder="All categories" /></Select.Trigger
            >
            <Select.Content>
              <Select.Group>
                {#each categories as item (item.value)}
                  <Select.Item value={item.value} label={item.label}>{item.label}</Select.Item>
                {/each}
              </Select.Group>
            </Select.Content>
          </Select.Root>
          <fieldset class="ml-auto flex items-center gap-2 text-xs" disabled={saving}>
            <legend class="sr-only">Prompt view</legend>
            <label class="flex cursor-pointer items-center gap-1"
              ><input type="radio" name="brainstorm-view" value="card" bind:group={view} /> Card</label
            >
            <label class="flex cursor-pointer items-center gap-1"
              ><input type="radio" name="brainstorm-view" value="list" bind:group={view} /> List</label
            >
          </fieldset>
        </div>

        {#if view === 'list'}
          <ul
            class="flex max-h-72 flex-col gap-1 overflow-y-auto"
            aria-label="Brainstorm questions"
          >
            {#each filtered as prompt (prompt.id)}
              <li>
                <button
                  type="button"
                  disabled={saving}
                  class="flex w-full flex-col gap-1 rounded-md p-2 text-left text-sm hover:bg-secondary focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
                  onclick={() => {
                    selectPrompt(prompt.id);
                    view = 'card';
                  }}
                >
                  <span>{prompt.question}</span>
                  <span class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {prompt.category}
                    {#if answered.has(prompt.id)}<Badge variant="secondary">Answered</Badge>{/if}
                    {#if drafts[prompt.id]?.answer.trim() || drafts[prompt.id]?.picked.length}<Badge
                        variant="outline">Draft</Badge
                      >{/if}
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {:else if current}
          <form class="flex flex-col gap-3" onsubmit={submit}>
            <div class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{current.category}</Badge>
              {#if answered.has(current.id)}<span>Answered before</span>{/if}
              <span class="ml-auto">Saves to {fieldLabel ?? 'content'}</span>
            </div>
            <label for="brainstorm-answer" class="text-base font-medium">{current.question}</label>
            <fieldset disabled={saving} class="flex min-w-0 flex-col gap-3">
              <legend class="sr-only">Your idea</legend>
              {#if tagMode}
                {#if current.suggestions?.length}
                  <div class="flex flex-wrap gap-1.5">
                    {#each current.suggestions as suggestion (suggestion)}
                      <Button
                        type="button"
                        size="sm"
                        variant={draft.picked.includes(suggestion) ? 'default' : 'outline'}
                        aria-pressed={draft.picked.includes(suggestion)}
                        onclick={() => togglePick(suggestion)}>{suggestion}</Button
                      >
                    {/each}
                  </div>
                {/if}
                <Input
                  id="brainstorm-answer"
                  value={draft.answer}
                  oninput={(event) => updateDraft({ answer: event.currentTarget.value })}
                  onkeydown={onKeydown}
                  placeholder="Add your own, comma separated"
                />
              {:else}
                <Textarea
                  id="brainstorm-answer"
                  value={draft.answer}
                  oninput={(event) => updateDraft({ answer: event.currentTarget.value })}
                  onkeydown={onKeydown}
                  class="min-h-24"
                  placeholder="Write whatever comes to mind…"
                />
              {/if}
            </fieldset>
            {#if error}<p role="alert" class="text-xs text-destructive">{error}</p>{/if}
            <div class="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={!submitValue || saving}
                >{saving ? 'Saving…' : 'Save answer'}</Button
              >
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onclick={() => selectPrompt(adjacentPrompt(filtered, answered, selectedId, -1))}
                ><ArrowLeft data-icon="inline-start" />Previous</Button
              >
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onclick={() => selectPrompt(adjacentPrompt(filtered, answered, selectedId, 1))}
                >Next<ArrowRight data-icon="inline-end" /></Button
              >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onclick={() => selectPrompt(randomPrompt(filtered, answered, selectedId))}
                ><Shuffle data-icon="inline-start" />Random</Button
              >
              {#if tagMode && current.suggestions?.length}
                <Button type="button" size="sm" variant="ghost" disabled={saving} onclick={roll}
                  ><Dices data-icon="inline-start" />Roll 3</Button
                >
              {/if}
            </div>
            {#if filtered.every((prompt) => answered.has(prompt.id))}<p
                class="text-xs text-muted-foreground"
              >
                You’ve explored these questions. Revisit any for a fresh angle.
              </p>{/if}
          </form>
        {/if}
      </div>
    {/if}
  </section>
{/if}
