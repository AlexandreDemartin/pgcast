// Copyright (C) 2026 Alexandre Demartin
// A code block with hover types (`<lazy-pre>`, from twoslash.ts § lazyHydratedCode). Its HTML is the `<pre>` it stands for, so
// the page, its text and its styles do not change; what changes is when Vue hydrates it: on the first pointer, focus or touch
// on the block, not at load, where a reference page's 278 menus cost 350 to 420 ms of blocking time on a slowed CPU.
// Hydrating is not enough for the menu under the pointer or the focus: it did not exist for the event that woke the block, so the
// event goes again to the menu's trigger, the `<span>` that floating-vue listens on (mouseenter, focus, touchstart).
import { defineAsyncComponent, h, nextTick, type HydrationStrategy } from 'vue';

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

export default defineAsyncComponent({
  loader: () => Promise.resolve((_: unknown, { slots }: { slots: { default?: () => unknown } }) => h('pre', null, slots.default?.() as never)),
  hydrate: wake,
});
