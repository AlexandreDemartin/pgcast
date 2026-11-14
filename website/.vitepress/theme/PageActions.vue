<script setup lang="ts">
// Copyright (C) 2026 Alexandre Demartin
// A written page's Markdown for an assistant: "Copy page", and a menu to copy it, view it, or open a new chat in ChatGPT
// or Claude whose prompt names its URL. Two in the layout (Layout.vue), one shown at a time by style.css: under "On this
// page" from 1280px, where VitePress shows that rail, else beside the title; the hidden one is `display: none`, so out
// of the accessibility tree, and each has its own ids. The Markdown is `/<page>.md`, the page's part of llms-full.txt,
// written at build (llms.ts): fetched only when a copy is asked for, from the site itself; the chats are plain links. Not on the home, the changelog, the playground, the 404 or a "Coming" page: the outline's written
// pages only, as llms-full.txt. The menu is WAI-ARIA's menu button (https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/).
import { computed, nextTick, onUnmounted, ref, useId, watch } from 'vue';
import { useData, withBase } from 'vitepress';
import { outlineIn } from '../outline.ts';
import Icon from './Icon.vue';
import { useWords } from './words.ts';

const { place } = defineProps<{ place: 'title' | 'rail' }>();

const
  { page } = useData(),
  { lang, w } = useWords(),
  id = useId(),
  links = computed(() => new Set(outlineIn(lang.value).flatMap(group => [group.link, ...group.items.map(item => item.link)]))),
  link = computed(() => '/' + page.value.relativePath.replace(/\.md$/, '')),
  written = computed(() => page.value.params === undefined && links.value.has(link.value)),  // a "Coming" page has `params`
  markdown = computed(() => withBase(`${link.value}.md`)),
  // the site's own URL (config.ts), so that a chat opened from a preview still names the page an assistant can read
  prompt = computed(() => w.value.prompt(`${__PGCAST_SITE__}${link.value.slice(1)}.md`)),
  chats = computed(() => [
    { name: 'ChatGPT', icon: 'openai' as const, href: `https://chatgpt.com/?q=${encodeURIComponent(prompt.value)}` },
    { name: 'Claude', icon: 'claude' as const, href: `https://claude.ai/new?q=${encodeURIComponent(prompt.value)}` },
  ]),
  open = ref(false),
  status = ref<'' | 'copied' | 'notCopied'>(''),
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
    status.value = 'copied';
  } catch {
    status.value = 'notCopied';
  }
  timer = setTimeout(() => { status.value = ''; }, 1400);
}

const items = () => [...menu.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []];

/**
 * Place the menu, fixed, so that the rail's scrolling box does not cut it: its right edge under the chevron's, inside
 * the viewport, under the button or, where it would not fit, over it; scaled from the chevron.
 */
function anchor() {
  if (!toggle.value?.parentElement || !menu.value) return;
  const
    button = toggle.value.parentElement.getBoundingClientRect(),
    chevron = toggle.value.getBoundingClientRect(),
    { style, offsetWidth: width, offsetHeight: height } = menu.value,
    edge = 16, gap = 4,
    left = Math.max(edge, Math.min(button.right - width, document.documentElement.clientWidth - edge - width)),
    below = button.bottom + gap + height <= innerHeight - edge || button.top - gap - height < edge;
  style.left = `${left}px`;
  style.top = below ? `${button.bottom + gap}px` : '';
  style.bottom = below ? '' : `${innerHeight - button.top + gap}px`;
  style.transformOrigin = `${chevron.left + chevron.width / 2 - left}px ${below ? 'top' : 'bottom'}`;
}

async function show(focus: 'first' | 'last') {
  open.value = true;
  await nextTick();
  anchor();
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

// a press outside closes the menu, as does the focus leaving it; a scroll or a resize moves it with its button
function onOutside(e: Event) {
  if (!root.value?.contains(e.target as Node)) close(false);
}
function listen(on: boolean) {
  for (const type of ['pointerdown', 'focusin']) {
    if (on) document.addEventListener(type, onOutside);
    else document.removeEventListener(type, onOutside);
  }
  for (const type of ['scroll', 'resize']) {  // a scroll in any box: the rail scrolls in its own
    if (on) window.addEventListener(type, anchor, { capture: true, passive: true });
    else window.removeEventListener(type, anchor, { capture: true });
  }
}
watch(open, listen);
watch(link, () => { close(false); status.value = ''; });  // another page, in the same layout
onUnmounted(() => {
  clearTimeout(timer);
  listen(false);
});
</script>

<template>
  <div v-if="written" ref="root" class="PageActions" :class="place">
    <div class="split">
      <button type="button" class="copy" @click="copy">
        <span class="IconSwap" :class="{ done: status === 'copied' }"><Icon name="copy" /><Icon name="check" /></span>
        <span class="label">{{ w.copyPage }}</span>
      </button>
      <button
        ref="toggle"
        type="button"
        class="toggle"
        :aria-label="w.moreWays"
        aria-haspopup="menu"
        :aria-controls="`${id}-menu`"
        :aria-expanded="open"
        @click="onToggleClick"
        @keydown="onToggleKey"
      >
        <Icon name="chevronDown" />
      </button>
    </div>
    <!-- each row: its icon, its name, then what it does, read as its description rather than in its name -->
    <div
      v-show="open"
      :id="`${id}-menu`"
      ref="menu"
      class="menu"
      role="menu"
      :aria-label="w.thisPage"
      @keydown="onMenuKey"
    >
      <button type="button" role="menuitem" tabindex="-1" :aria-describedby="`${id}-copy`" @click="copy">
        <Icon name="copy" />
        <span class="title">{{ w.copyPage }}</span>
        <span :id="`${id}-copy`" class="desc" aria-hidden="true">{{ w.copyPageDesc }}</span>
      </button>
      <!-- a `target` leaves the link to the browser: VitePress's router would look for a page at `/<page>.md` -->
      <a role="menuitem" tabindex="-1" :href="markdown" target="_self" :aria-describedby="`${id}-view`" @click="close(false)">
        <Icon name="file" />
        <span class="title">{{ w.viewMarkdown }}</span>
        <span :id="`${id}-view`" class="desc" aria-hidden="true">{{ w.viewMarkdownDesc }}</span>
      </a>
      <a
        v-for="chat in chats"
        :key="chat.name"
        role="menuitem"
        tabindex="-1"
        :href="chat.href"
        target="_blank"
        rel="noopener"
        :aria-describedby="`${id}-${chat.icon}`"
        @click="close(false)"
      >
        <Icon :name="chat.icon" />
        <span class="title">{{ w.openIn(chat.name) }}<span class="visually-hidden"> {{ w.newTab }}</span><Icon name="external" /></span>
        <span :id="`${id}-${chat.icon}`" class="desc" aria-hidden="true">{{ w.askIn(chat.name) }}</span>
      </a>
    </div>
    <span class="status" aria-live="polite">{{ status && w[status] }}</span>
  </div>
</template>
