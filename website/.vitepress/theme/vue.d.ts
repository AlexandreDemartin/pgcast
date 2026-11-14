// Copyright (C) 2026 Alexandre Demartin
// A `.vue` file as `index.ts` imports it, for `tsc -p .vitepress`: VitePress compiles the components, tsc does not.
declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent;
  export default component;
}
