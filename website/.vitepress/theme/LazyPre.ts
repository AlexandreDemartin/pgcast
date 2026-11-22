// Copyright (C) 2026 Alexandre Demartin
// A code block with hover types (`<pre is="vue:lazy-pre">`, from twoslash.ts § lazyHydratedCode). It renders the
// `<pre>` it stands for with all its attributes, so the page, its styles and its tab order do not change: a functional
// component without props would pass on only `class`, `style` and listeners, and drop Shiki's `tabindex` and `dir`.
// What changes is when Vue hydrates the block and its floating-vue menus: on the first pointer, focus or touch on the
// block, not at load. Hydrating is not enough for the menu under the pointer or the focus: it did not exist for the
// event that woke the block, so the event goes again to the menu's trigger, the `<span>` that floating-vue listens on
// (mouseenter, focus, touchstart).
import { defineAsyncComponent, h, nextTick, type FunctionalComponent, type HydrationStrategy } from 'vue';

const trigger = (target: EventTarget | null) => {
  const el = target instanceof Element ? target.closest('.twoslash-hover') : null;
  return el?.firstElementChild ?? null;
};

const wake: HydrationStrategy = (hydrate, forEach) => {
  const
    events = ['mouseenter', 'focusin', 'touchstart'],
    listener = (event: Event) => {
      teardown();
      hydrate();
      // the menus listen once they are mounted, which Vue does after the event
      void nextTick(() => {
        if (event instanceof MouseEvent) trigger(document.elementFromPoint(event.clientX, event.clientY))?.dispatchEvent(new MouseEvent('mouseenter'));
        else if (event.type === 'focusin') trigger(event.target)?.dispatchEvent(new FocusEvent('focus'));
        else trigger(event.target)?.dispatchEvent(new Event('touchstart', { bubbles: true }));
      });
    },
    teardown = () => forEach(el => events.forEach(type => el.removeEventListener(type, listener)));
  forEach(el => events.forEach(type => el.addEventListener(type, listener, { passive: true })));
  return teardown;
};

const pre: FunctionalComponent = (_, { attrs, slots }) => h('pre', attrs, slots.default?.());
pre.inheritAttrs = false;

export default defineAsyncComponent({ loader: () => Promise.resolve(pre), hydrate: wake });
