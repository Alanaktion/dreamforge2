<script lang="ts">
  import { onDestroy } from 'svelte';
  import ImageDropUpload from '$lib/components/ImageDropUpload.svelte';
  import { page } from '$app/state';
  import { ArrowLeft, Upload, Image, X } from '@lucide/svelte';
  import { IMAGE_ACCEPT, type ProjectImage } from '$lib/api/images';
  import { Button } from '$lib/components/ui/button';

  let uploader = $state<ImageDropUpload>();
  let destroyed = false;
  let uploadFiles = $state<File[]>([]);
  let uploading = $state(false);
  let dropUploading = $state(false);
  let previewUrls = $state<string[]>([]);

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files) return;
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    uploadFiles = Array.from(input.files);
    input.value = '';
    previewUrls = uploadFiles.map((f) => URL.createObjectURL(f));
  }

  let readOnly = $derived(page.data?.role === 'commenter');
  let images = $derived((page.data?.images ?? []) as ProjectImage[]);

  async function upload(event: SubmitEvent) {
    event.preventDefault();
    if (uploading || dropUploading || readOnly || !uploader) return;
    uploading = true;
    const kept = await uploader.enqueue([...uploadFiles]);
    if (destroyed) return;
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
    // Keep only the files that failed, so they can be retried or removed.
    uploadFiles = kept;
    previewUrls = kept.map((f) => URL.createObjectURL(f));
    uploading = false;
  }

  onDestroy(() => {
    destroyed = true;
    previewUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  function removePreview(i: number) {
    URL.revokeObjectURL(previewUrls[i]);
    uploadFiles = uploadFiles.filter((_, idx) => idx !== i);
    previewUrls = previewUrls.filter((_, idx) => idx !== i);
  }
</script>

<svelte:head>
  <title>Images — {page.data?.project?.name || 'Project'} — DreamForge</title>
</svelte:head>

<div class="mx-auto max-w-5xl p-6">
  {#key page.params.id}
    <ImageDropUpload
      projectId={page.params.id!}
      disabled={readOnly}
      bind:this={uploader}
      bind:busy={dropUploading}
    />
  {/key}
  <div class="mb-6">
    <a
      href="/projects/{page.params.id}"
      class="mb-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft class="h-4 w-4" />
      Back to {page.data?.project?.name || 'Project'}
    </a>
    <h1 class="text-2xl font-bold">Images</h1>
    <p class="text-sm text-muted-foreground">
      Manage images for {page.data?.project?.name || 'this project'}
    </p>
  </div>

  {#if !readOnly}
    <div class="mb-8 rounded-lg border border-border bg-card p-4">
      <form onsubmit={upload} class="space-y-4">
        <label
          class="flex items-center justify-center border-2 border-dashed border-border rounded-lg p-6"
        >
          <div class="flex cursor-pointer flex-col items-center gap-2">
            <Upload class="h-8 w-8 text-muted-foreground" />
            <span class="text-sm text-muted-foreground"
              >Click to select images, or drop anywhere to upload</span
            >
            <span class="text-xs text-muted-foreground">PNG, JPG, GIF, WebP, SVG</span>
            <input
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              aria-label="Select images"
              class="hidden"
              disabled={uploading}
              onchange={handleFileSelect}
            />
          </div>
        </label>

        {#if previewUrls.length > 0}
          <div class="flex flex-wrap gap-3">
            {#each previewUrls as url, i}
              <div class="group relative">
                <img
                  src={url}
                  alt={uploadFiles[i].name}
                  class="h-24 w-24 rounded-lg border border-border object-cover"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-xs"
                  class="absolute -right-1.5 -top-1.5 opacity-0 group-hover:opacity-100 rounded-full"
                  onclick={() => removePreview(i)}
                  aria-label="Remove {uploadFiles[i].name}"
                >
                  <X class="h-3 w-3" />
                </Button>
                <p class="mt-1 max-w-24 truncate text-xs text-muted-foreground">
                  {uploadFiles[i].name}
                </p>
              </div>
            {/each}
          </div>
        {/if}

        {#if uploadFiles.length > 0}
          <Button type="submit" disabled={uploading || dropUploading}>
            {uploading
              ? 'Uploading...'
              : `Upload ${uploadFiles.length} file${uploadFiles.length > 1 ? 's' : ''}`}
          </Button>
        {/if}
      </form>
    </div>
  {/if}

  <div>
    {#if images.length === 0}
      <div class="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <Image class="h-12 w-12 opacity-30" />
        <p class="max-w-md text-center text-sm">
          No images yet. Upload portraits, maps, and mood boards, then attach them to entries or use
          them as focus mode backgrounds.
        </p>
      </div>
    {:else}
      <div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {#each images as img (img.id)}
          <a
            href="/projects/{page.params.id}/images/{img.id}"
            class="group rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50"
          >
            <div class="aspect-square overflow-hidden bg-secondary">
              <img
                src={img.url}
                alt={img.altText || img.originalName}
                class="h-full w-full object-cover transition-transform group-hover:scale-105"
                loading="lazy"
              />
            </div>
            <div class="p-2">
              <p class="truncate text-xs font-medium">{img.originalName}</p>
              {#if img.caption}
                <p class="truncate text-xs text-muted-foreground">{img.caption}</p>
              {/if}
            </div>
          </a>
        {/each}
      </div>
    {/if}
  </div>
</div>
