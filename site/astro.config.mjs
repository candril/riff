import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://candril.github.io',
  base: '/riff',
  integrations: [
    starlight({
      title: 'riff',
      description: 'Terminal code review for GitHub PRs and local changes. Vim motions, inline comments, no browser.',
      logo: {
        src: './src/assets/logo.svg',
      },
      favicon: '/logo.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/candril/riff',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/candril/riff/edit/main/site/',
      },
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Installation', slug: 'guide/installation' },
            { label: 'Getting Started', slug: 'guide/getting-started' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Key Bindings', slug: 'reference/key-bindings' },
            { label: 'Views & Panels', slug: 'reference/views' },
            { label: 'Comments & Threads', slug: 'reference/comments' },
            { label: 'GitHub Workflow', slug: 'reference/github' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'CLI', slug: 'reference/cli' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
})
