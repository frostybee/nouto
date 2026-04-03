// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Nouto',
			logo: {
				src: './src/assets/nouto-logo.png',
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/frostybee/nouto' },
			],
			head: [
				{
					tag: 'script',
					content: `
						(function() {
							var stored = localStorage.getItem('starlight-theme');
							if (stored === null || stored === '') {
								localStorage.setItem('starlight-theme', 'dark');
								document.documentElement.dataset.theme = 'dark';
							}
						})();
					`,
				},
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
						{ label: 'VS Code vs Desktop', slug: 'getting-started/platforms' },
					],
				},
				{
					label: 'Features',
					autogenerate: { directory: 'features' },
				},
				{
					label: 'Authentication',
					autogenerate: { directory: 'authentication' },
				},
				{
					label: 'Building Requests',
					autogenerate: { directory: 'building-requests' },
				},
				{
					label: 'Testing',
					autogenerate: { directory: 'testing' },
				},
				{
					label: 'Importing',
					autogenerate: { directory: 'importing' },
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
		}),
	],
});