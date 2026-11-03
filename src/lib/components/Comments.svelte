<script lang="ts">
  import { MessageSquare, Trash2, Check } from '@lucide/svelte';
  import { formatDate } from '$lib/utils';

  interface Comment {
    id: string;
    userId: string;
    username: string;
    body: string;
    createdAt: string;
    resolved: boolean;
  }

  let {
    projectId,
    targetType,
    targetId,
    currentUserId,
    projectOwnerId,
    role
  }: {
    projectId: string;
    targetType: string;
    targetId: string;
    currentUserId: string;
    projectOwnerId: string;
    role: string;
  } = $props();

  let comments = $state<Comment[]>([]);
  let newBody = $state('');
  let loading = $state(true);
  let submitting = $state(false);

  async function loadComments() {
    loading = true;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/comments?targetType=${encodeURIComponent(targetType)}&targetId=${encodeURIComponent(targetId)}`
      );
      if (res.ok) comments = await res.json();
    } finally {
      loading = false;
    }
  }

  async function submit() {
    if (!newBody.trim() || submitting) return;
    submitting = true;
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetType, targetId, body: newBody.trim() })
      });
      if (res.ok) {
        const comment = await res.json();
        comments = [...comments, comment];
        newBody = '';
      }
    } finally {
      submitting = false;
    }
  }

  async function deleteComment(commentId: string) {
    const res = await fetch(
      `/api/projects/${projectId}/comments/${encodeURIComponent(commentId)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      comments = comments.filter((c) => c.id !== commentId);
    }
  }

  async function toggleResolve(comment: Comment) {
    const res = await fetch(
      `/api/projects/${projectId}/comments/${encodeURIComponent(comment.id)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolved: !comment.resolved })
      }
    );
    if (res.ok) {
      comments = comments.map((c) => (c.id === comment.id ? { ...c, resolved: !c.resolved } : c));
    }
  }

  $effect(() => {
    loadComments();
  });
</script>

<div class="mt-8 border-t border-border pt-6">
  <div class="mb-4 flex items-center gap-2">
    <MessageSquare class="h-4 w-4 text-muted-foreground" />
    <h3 class="text-sm font-semibold">
      Comments {#if comments.length > 0}<span class="text-muted-foreground"
          >({comments.length})</span
        >{/if}
    </h3>
  </div>

  {#if loading}
    <p class="text-sm text-muted-foreground">Loading comments...</p>
  {:else}
    {#if comments.length === 0}
      <p class="text-sm text-muted-foreground">No comments yet.</p>
    {:else}
      <div class="space-y-3">
        {#each comments as comment}
          <div
            class="rounded-lg border border-border bg-card p-3 {comment.resolved
              ? 'opacity-60'
              : ''}"
          >
            <div class="mb-1 flex items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium">{comment.username}</span>
                <span class="text-xs text-muted-foreground">{formatDate(comment.createdAt)}</span>
                {#if comment.resolved}
                  <span
                    class="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600 dark:text-green-400"
                    >resolved</span
                  >
                {/if}
              </div>
              <div class="flex items-center gap-1">
                {#if role !== 'commenter'}
                  <button
                    onclick={() => toggleResolve(comment)}
                    class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    title={comment.resolved ? 'Unresolve' : 'Mark resolved'}
                  >
                    <Check class="h-3.5 w-3.5" />
                  </button>
                {/if}
                {#if comment.userId === currentUserId || currentUserId === projectOwnerId}
                  <button
                    onclick={() => deleteComment(comment.id)}
                    class="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    title="Delete comment"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                {/if}
              </div>
            </div>
            <p class="text-sm whitespace-pre-wrap">{comment.body}</p>
          </div>
        {/each}
      </div>
    {/if}

    <div class="mt-4">
      <textarea
        bind:value={newBody}
        placeholder="Add a comment..."
        rows="3"
        class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        onkeydown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}></textarea>
      <div class="mt-2 flex items-center justify-between">
        <span class="text-xs text-muted-foreground">Ctrl+Enter to submit</span>
        <button
          onclick={submit}
          disabled={!newBody.trim() || submitting}
          class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? 'Posting...' : 'Post comment'}
        </button>
      </div>
    </div>
  {/if}
</div>
