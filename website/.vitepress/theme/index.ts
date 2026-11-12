// Copyright (C) 2026 Alexandre Demartin
// VitePress's default theme, without its bundled Inter: the three faces come from Google Fonts (config.ts).
// Twoslash's hover types are floating-vue menus. On a desktop they open on focus too, so a keyboard reaches them; on
// a phone or tablet they keep the plugin's own trigger, a touch. `isMobile` is the plugin's test, which it does not export.
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import '@shikijs/vitepress-twoslash/style.css';
import DefaultTheme from 'vitepress/theme-without-fonts';
import type { Theme } from 'vitepress';
import CastPanel from './CastPanel.vue';
import GroupPages from './GroupPages.vue';
import InstallLine from './InstallLine.vue';
import Layout from './Layout.vue';
import SiteFooter from './SiteFooter.vue';
import './style.css';

const isMobile = typeof navigator !== 'undefined' &&
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.use(TwoslashFloatingVue, { themes: { twoslash: { triggers: isMobile ? ['touch'] : ['hover', 'touch', 'focus'] } } });
    app.component('CastPanel', CastPanel);
    app.component('GroupPages', GroupPages);
    app.component('InstallLine', InstallLine);
    app.component('SiteFooter', SiteFooter);
  },
} satisfies Theme;
