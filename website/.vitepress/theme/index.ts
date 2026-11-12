// Copyright (C) 2026 Alexandre Demartin
// VitePress's default theme, without its bundled Inter: the three faces come from Google Fonts (config.ts).
import DefaultTheme from 'vitepress/theme-without-fonts';
import type { Theme } from 'vitepress';
import InstallLine from './InstallLine.vue';
import Layout from './Layout.vue';
import SiteFooter from './SiteFooter.vue';
import './style.css';

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('InstallLine', InstallLine);
    app.component('SiteFooter', SiteFooter);
  },
} satisfies Theme;
