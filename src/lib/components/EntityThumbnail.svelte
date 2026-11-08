<script lang="ts">
  import { FileText } from '@lucide/svelte';
  import { cn } from '$lib/utils';

  let {
    src,
    icon: Icon = FileText,
    iconClass,
    class: className
  }: {
    src?: string | null;
    icon?: typeof FileText;
    iconClass?: string;
    class?: string;
  } = $props();

  let failedSrc = $state<string | null>(null);
</script>

<span
  class={cn('inline-flex size-4 shrink-0 items-center justify-center', className)}
  aria-hidden="true"
>
  {#if src && failedSrc !== src}
    <img
      {src}
      alt=""
      loading="lazy"
      class="size-full rounded object-cover"
      onerror={() => (failedSrc = src ?? null)}
    />
  {:else}
    <Icon class={cn('size-full text-muted-foreground', iconClass)} />
  {/if}
</span>
