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
					collapsed: true,
					items: [
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
						{ label: 'VS Code vs Desktop', slug: 'getting-started/platforms' },
					],
				},
				{
					label: 'Features',
					collapsed: true,
					items: [{ autogenerate: { directory: 'features' } }],
				},
				{
					label: 'Authentication',
					collapsed: true,
					items: [{ autogenerate: { directory: 'authentication' } }],
				},
				{
					label: 'Building Requests',
					collapsed: true,
					items: [{ autogenerate: { directory: 'building-requests' } }],
				},
				{
					label: 'Testing',
					collapsed: true,
					items: [{ autogenerate: { directory: 'testing' } }],
				},
				{
					label: 'Environments & Variables',
					collapsed: true,
					items: [{ autogenerate: { directory: 'variables' } }],
				},
				{
					label: 'Response & Inspection',
					collapsed: true,
					items: [{ autogenerate: { directory: 'response' } }],
				},
				{
					label: 'Tools',
					collapsed: true,
					items: [{ autogenerate: { directory: 'tools' } }],
				},
				{
					label: 'Import & Export',
					collapsed: true,
					items: [{ autogenerate: { directory: 'import-export' } }],
				},
				{
					label: 'Settings',
					collapsed: true,
					items: [{ autogenerate: { directory: 'settings' } }],
				},
				{
					label: 'CLI',
					collapsed: true,
					items: [{ autogenerate: { directory: 'cli' } }],
				},
				{
					label: 'Desktop App',
					collapsed: true,
					items: [{ autogenerate: { directory: 'desktop' } }],
				},
			],
		}),
	],
});