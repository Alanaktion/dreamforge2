<script lang="ts">
  import { onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { IMAGE_ACCEPT, linkImage, uploadImage } from '$lib/api/images';

  let {
    projectId,
    entityId,
    disabled = false,
    busy = $bindable(false)
  }: {
    projectId: string;
    entityId?: string;
    disabled?: boolean;
    busy?: boolean;
  } = $props();

  let dragging = $state(false);
  let status = $state('');
  let errors = $state<string[]>([]);
  let pending: {
    files: File[];
    projectId: string;
    entityId?: string;
    resolve: (failed: File[]) => void;
  }[] = [];
  let mounted = false;
  let depth = 0;

  function resetDrag() {
    depth = 0;
    dragging = false;
  }

  export function enqueue(files: File[]): Promise<File[]> {
    if (disabled || !files.length) return Promise.resolve(files);
    const result = new Promise<File[]>((resolve) => {
      pending.push({ files, projectId, entityId, resolve });
    });
    if (!busy) void processQueue();
    return result;
  }

  async function processQueue() {
    busy = true;
    errors = [];
    while (pending.length) {
      const batch = pending.shift()!;
      const failed: File[] = [];
      for (const [index, file] of batch.files.entries()) {
        if (mounted) status = `Uploading ${index + 1} of ${batch.files.length}: ${file.name}`;
        let failure = '';
        if (!IMAGE_ACCEPT.split(',').some((ext) => file.name.toLowerCase().endsWith(ext))) {
          failure = `${file.name}: Images must be PNG, JPEG, GIF, WebP or SVG`;
        } else if (file.size > 20 * 1024 * 1024) {
          failure = `${file.name}: Images can be at most 20 MB`;
        } else {
          try {
            const image = await uploadImage(batch.projectId, file);
            if (batch.entityId) {
              try {
                await linkImage(batch.projectId, image.id, batch.entityId);
              } catch (cause) {
                failure = `${file.name}: Uploaded to the gallery, but could not link: ${cause instanceof Error ? cause.message : 'Try linking it from the Images section.'}`;
              }
            }
          } catch (cause) {
            failure = `${file.name}: ${cause instanceof Error ? cause.message : 'Upload failed'}`;
          }
        }
        if (failure) failed.push(file);
        if (mounted && failure) errors = [...errors, failure];
      }
      batch.resolve(failed);
      await invalidateAll().catch(() => {
        if (mounted) {
          errors = [
            ...errors,
            'Could not refresh images. Reload the page to see completed uploads.'
          ];
        }
      });
    }
    if (mounted) {
      status = errors.length ? 'Uploads finished with errors.' : 'Images uploaded successfully.';
      busy = false;
    }
  }

  onMount(() => {
    mounted = true;
    const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes('Files');
    function enter(event: DragEvent) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depth++;
      dragging = !disabled;
    }
    function over(event: DragEvent) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    }
    function leave(event: DragEvent) {
      if (!isFileDrag(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) resetDrag();
    }
    function drop(event: DragEvent) {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      resetDrag();
      void enqueue(Array.from(event.dataTransfer?.files ?? []));
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === 'Escape') resetDrag();
    }
    window.addEventListener('keydown', keydown);
    window.addEventListener('dragenter', enter, true);
    window.addEventListener('dragover', over, true);
    window.addEventListener('dragleave', leave, true);
    window.addEventListener('drop', drop, true);
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('blur', resetDrag);
    return () => {
      mounted = false;
      busy = false;
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('dragenter', enter, true);
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('dragleave', leave, true);
      window.removeEventListener('drop', drop, true);
      window.removeEventListener('dragend', resetDrag);
      window.removeEventListener('blur', resetDrag);
    };
  });
</script>

{#if dragging && !disabled}
  <div
    class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/80"
  >
    <div class="rounded-lg border-2 border-dashed border-primary bg-card p-8 text-lg font-medium">
      {entityId ? 'Drop images to upload and link' : 'Drop images to upload'}
    </div>
  </div>
{/if}

{#if entityId && !disabled}
  <label class="mt-3 flex flex-col gap-2 text-sm">
    Upload images or drop them anywhere on this page
    <input
      type="file"
      accept={IMAGE_ACCEPT}
      multiple
      aria-label="Upload images"
      onchange={(event) => {
        void enqueue(Array.from(event.currentTarget.files ?? []));
        event.currentTarget.value = '';
      }}
    />
  </label>
{/if}
<div aria-live="polite" class="text-sm text-muted-foreground">{status}</div>
{#if errors.length}
  <ul role="alert" class="text-sm text-destructive">
    {#each errors as error, index (index)}
      <li>{error}</li>
    {/each}
  </ul>
{/if}
