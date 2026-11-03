import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: [
      'build/',
      'backend/',
      'work/',
      'test-results/',
      'playwright-report/',
      '.svelte-kit/',
      'data/',
      'node_modules/',
      '.opencode/',
      '.agents/',
      'src/lib/components/ui/'
    ]
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node }
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig
      }
    }
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
      ],

      // This project links with plain hrefs and goto() rather than SvelteKit's
      // resolve() helper. Enforcing it would be a codebase-wide rewrite with no
      // correctness benefit here.
      'svelte/no-navigation-without-resolve': 'off',

      // Warnings, not errors: each one is a real (if minor) improvement, but there
      // are enough of them that failing the build on them would just mean the lint
      // script never gets run. Tighten to 'error' as they get worked through.
      'svelte/require-each-key': 'warn',
      'svelte/prefer-svelte-reactivity': 'warn',
      'svelte/prefer-writable-derived': 'warn',
      // Used deliberately at the cytoscape and tiptap interop boundaries, whose
      // own types do not describe the callback forms this code passes.
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  },
  {
    // vi.hoisted() runs before ESM imports are evaluated, so require() is the only
    // way to load better-sqlite3 inside it.
    files: ['**/__tests__/**'],
    rules: { '@typescript-eslint/no-require-imports': 'off' }
  }
);
