// Copyright (C) 2026 Alexandre Demartin
// VitePress's default theme, without its bundled Inter: the three faces come from Google Fonts (config.ts).
// Twoslash's hover types are floating-vue menus, opened on focus too, so a keyboard reaches them.
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client';
import '@shikijs/vitepress-twoslash/style.css';
import DefaultTheme from 'vitepress/theme-without-fonts';
import type { Theme } from 'vitepress';
import CastPanel from './CastPanel.vue';
import InstallLine from './InstallLine.vue';
import Layout from './Layout.vue';
import SiteFooter from './SiteFooter.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.use(TwoslashFloatingVue, { themes: { twoslash: { triggers: ['hover', 'touch', 'focus'] } } });
    app.component('CastPanel', CastPanel);
    app.component('InstallLine', InstallLine);
    app.component('SiteFooter', SiteFooter);
  },
} satisfies Theme;
