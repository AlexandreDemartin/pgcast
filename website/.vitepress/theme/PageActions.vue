<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// Beside a written page's title (Layout.vue), its Markdown for an assistant: "Copy page", and a menu to copy it, view
// it, or open a new chat in ChatGPT or Claude whose prompt names its URL. The Markdown is `/<page>.md`, the page's part
// of llms-full.txt, written at build (llms.ts): fetched only when a copy is asked for, from the site itself; the chats
// are plain links. Not on the home, the changelog, the playground, the 404 or a "Coming" page: the outline's written
// pages only, as llms-full.txt. The menu is WAI-ARIA's menu button (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useData, withBase } from 'vitepress';
import { outline } from '../outline.ts';
import Icon from './Icon.vue';

const
  { page } = useData(),
  links = new Set(outline.flatMap(group => [group.link, ...group.items.map(item => item.link)])),
  link = computed(() => '/' + page.value.relativePath.replace(/\.md$/, '')),
  written = computed(() => page.value.params === undefined && links.has(link.value)),  // a "Coming" page has `params`
  markdown = computed(() => withBase(`${link.value}.md`)),
  // the site's own URL (config.ts), so that a chat opened from a preview still names the page an assistant can read
  prompt = computed(() => `Read ${__PGCAST_SITE__}${link.value.slice(1)}.md so I can ask questions about it.`),
  chats = computed(() => [
    { name: 'ChatGPT', href: `https://chatgpt.com/?q=${encodeURIComponent(prompt.value)}` },
    { name: 'Claude', href: `https://claude.ai/new?q=${encodeURIComponent(prompt.value)}` },
  ]),
  open = ref(false),
  status = ref(''),
  root = ref<HTMLElement>(),
  toggle = ref<HTMLButtonElement>(),
  menu = ref<HTMLElement>();

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Copy the page's Markdown. The clipboard gets a promise of it, as Safari keeps the click's permission only for a write
 * started in the click itself; a browser with no `ClipboardItem` gets the text once fetched.
 */
async function copy() {
  close();  // from the menu, the focus goes back to its button
  clearTimeout(timer);
  const text = fetch(markdown.value).then(response => response.ok ? response.text() : Promise.reject(response.status));
  try {
    if (typeof ClipboardItem === 'undefined') await navigator.clipboard.writeText(await text);
    else await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(t => new Blob([t], { type: 'text/plain' })) })]);
    status.value = 'Copied';
  } catch {
    status.value = 'Not copied';
  }
  timer = setTimeout(() => { status.value = ''; }, 1400);
}

const items = () => [...menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []];

async function show(focus: 'first' | 'last') {
  open.value = true;
  await nextTick();
  const all = items();
  all[focus === 'first' ? 0 : all.length - 1]?.focus();
}

function close(refocus = true) {
  if (!open.value) return;
  open.value = false;
  if (refocus) toggle.value?.focus();
}

function onToggleKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    show(e.key === 'ArrowDown' ? 'first' : 'last');
  }
}

function onToggleClick() {
  if (open.value) close();
  else show('first');
}

function onMenuKey(e: KeyboardEvent) {
  const all = items(), i = all.indexOf(document.activeElement as HTMLElement);
  const to =
    e.key === 'ArrowDown' ? (i + 1) % all.length :
    e.key === 'ArrowUp' ? (i - 1 + all.length) % all.length :
    e.key === 'Home' ? 0 :
    e.key === 'End' ? all.length - 1 :
    undefined;
  if (to !== undefined) {
    e.preventDefault();
    all[to]?.focus();
  }
  else if (e.key === 'Escape') {
    e.preventDefault();
    close();
  }
  else if (e.key === 'Tab') close(false);
}

// a press outside closes the menu, as does the focus leaving it
function onOutside(e: Event) {
  if (!root.value?.contains(e.target as Node)) close(false);
}
watch(open, isOpen => {
  for (const type of ['pointerdown', 'focusin']) {
    if (isOpen) document.addEventListener(type, onOutside);
    else document.removeEventListener(type, onOutside);
  }
});
watch(link, () => { close(false); status.value = ''; });  // another page, in the same layout
onUnmounted(() => {
  clearTimeout(timer);
  for (const type of ['pointerdown', 'focusin']) document.removeEventListener(type, onOutside);
});
</script>

<template>
  <div v-if="written" ref="root" class="PageActions">
    <div class="split">
      <button type="button" class="copy" @click="copy">
        <Icon :name="status === 'Copied' ? 'check' : 'copy'" />
        <span class="label">Copy page</span>
      </button>
      <button
        ref="toggle"
        type="button"
        class="toggle"
        aria-label="More ways to use this page"
        aria-haspopup="menu"
        aria-controls="page-actions-menu"
        :aria-expanded="open"
        @click="onToggleClick"
        @keydown="onToggleKey"
      >
        <Icon name="chevronDown" />
      </button>
    </div>
    <!-- each row: its icon, its name, then what it does, read as its description rather than in its name -->
    <div v-show="open" id="page-actions-menu" ref="menu" class="menu" role="menu" aria-label="This page" @keydown="onMenuKey">
      <button type="button" role="menuitem" tabindex="-1" aria-describedby="page-actions-copy" @click="copy">
        <Icon name="copy" />
        <span class="title">Copy page</span>
        <span id="page-actions-copy" class="desc" aria-hidden="true">Copy page as Markdown for LLMs</span>
      </button>
      <!-- a `target` leaves the link to the browser: VitePress's router would look for a page at `/<page>.md` -->
      <a role="menuitem" tabindex="-1" :href="markdown" target="_self" aria-describedby="page-actions-view" @click="close(false)">
        <Icon name="file" />
        <span class="title">View as Markdown</span>
        <span id="page-actions-view" class="desc" aria-hidden="true">Open this page as plain text</span>
      </a>
      <a
        v-for="chat in chats"
        :key="chat.name"
        role="menuitem"
        tabindex="-1"
        :href="chat.href"
        target="_blank"
        rel="noopener"
        :aria-describedby="`page-actions-${chat.name}`"
        @click="close(false)"
      >
        <Icon name="chat" />
        <span class="title">Open in {{ chat.name }}<span class="visually-hidden"> (new tab)</span><Icon name="external" /></span>
        <span :id="`page-actions-${chat.name}`" class="desc" aria-hidden="true">Ask about this page in {{ chat.name }}</span>
      </a>
    </div>
    <span class="status" aria-live="polite">{{ status }}</span>
  </div>
</template>
