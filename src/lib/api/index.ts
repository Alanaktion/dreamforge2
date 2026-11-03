// Client for the FastAPI backend (backend/). In production FastAPI serves this app, and in
// development Vite proxies /api to it, so requests are always same-origin and the session
// cookie (HttpOnly, SameSite=Lax) travels with them.
import { error } from '@sveltejs/kit';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** SvelteKit's load `fetch`, so loads re-run and dedupe correctly. */
  fetch?: Fetch;
}

function detail(payload: unknown, status: number): string {
  const value = (payload as { detail?: unknown } | null)?.detail;
  if (typeof value === 'string') return value;
  // FastAPI validation errors: [{ msg, loc }, ...]
  if (Array.isArray(value) && value[0]?.msg) return String(value[0].msg);
  return status >= 500 ? 'Something went wrong. Try again.' : 'Request failed';
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, fetch: f = fetch } = options;
  const response = await f(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined && method === 'GET' ? {} : { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {})
  });
  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, detail(payload, response.status));
  return payload as T;
}

/** For loads: turn API failures into SvelteKit errors (rendered by +error.svelte). */
export async function load<T>(path: string, f: Fetch): Promise<T> {
  try {
    return await api<T>(path, { fetch: f });
  } catch (cause) {
    if (cause instanceof ApiError) error(cause.status, cause.message);
    throw cause;
  }
}

/** For pages whose server code has not moved to the API yet. */
export function notPorted(): never {
  error(501, 'This page has not been moved to the new backend yet.');
}

/**
 * Form fields as a JSON object. A checked checkbox ("on") becomes true; `include` adds
 * unchecked checkboxes as false.
 */
export function formJson(form: HTMLFormElement): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of new FormData(form)) data[key] = value === 'on' ? true : value;
  for (const input of form.querySelectorAll<HTMLInputElement>('input[type=checkbox][name]'))
    if (!(input.name in data)) data[input.name] = false;
  return data;
}

export type FormResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export interface ApiFormOptions<T> {
  path: string;
  method?: ApiOptions['method'];
  /** Adjust the JSON body built from the form fields. */
  body?: (fields: Record<string, unknown>) => unknown;
  onresult: (result: FormResult<T>, form: HTMLFormElement) => void | Promise<void>;
}

/**
 * `use:apiForm={{ path, method, onresult }}` — submits a form to the API as JSON instead of
 * to a SvelteKit form action. The submit button is disabled while the request runs.
 */
export function apiForm<T>(form: HTMLFormElement, initial: ApiFormOptions<T>) {
  let options = initial;
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const fields = formJson(form);
    const buttons = form.querySelectorAll<HTMLButtonElement>('button[type=submit]');
    buttons.forEach((b) => (b.disabled = true));
    try {
      const data = await api<T>(options.path, {
        method: options.method ?? 'POST',
        body: options.body ? options.body(fields) : fields
      });
      await options.onresult({ ok: true, data }, form);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      const message =
        cause instanceof ApiError ? cause.message : 'Could not reach the server. Try again.';
      await options.onresult({ ok: false, status, error: message }, form);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  form.addEventListener('submit', submit);
  return {
    update(next: ApiFormOptions<T>) {
      options = next;
    },
    destroy() {
      form.removeEventListener('submit', submit);
    }
  };
}
