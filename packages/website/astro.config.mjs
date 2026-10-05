// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// https://astro.build/config
export default defineConfig({
	site: 'https://nouto.frostybee.dev',
	integrations: [
		starlight({
			title: 'Nouto',
			plugins: [starlightLinksValidator()],
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
					label: 'Getting started',
					collapsed: true,
					items: [
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick start', slug: 'getting-started/quick-start' },
						{ label: 'VS Code vs desktop', slug: 'getting-started/platforms' },
					],
				},
				{
					label: 'API client',
					collapsed: false,
					items: [
						{
							label: 'Protocols & collections',
							collapsed: true,
							items: [
								{ label: 'HTTP requests', slug: 'features/http-requests' },
								{ label: 'GraphQL', slug: 'features/graphql' },
								{ label: 'WebSocket', slug: 'features/websocket' },
								{ label: 'Server-Sent Events', slug: 'features/sse' },
								{ label: 'gRPC', slug: 'features/grpc' },
								{ label: 'Collections', slug: 'features/collections' },
								{ label: 'Benchmarking', slug: 'features/benchmarking' },
							],
						},
						{
							label: 'Building requests',
							collapsed: true,
							items: [{ autogenerate: { directory: 'building-requests' } }],
						},
						{
							label: 'Authentication',
							collapsed: true,
							items: [{ autogenerate: { directory: 'authentication' } }],
						},
						{
							label: 'Environments & variables',
							collapsed: true,
							items: [{ autogenerate: { directory: 'variables' } }],
						},
						{
							label: 'Testing & scripts',
							collapsed: true,
							items: [{ autogenerate: { directory: 'testing' } }],
						},
						{
							label: 'Response & inspection',
							collapsed: true,
							items: [{ autogenerate: { directory: 'response' } }],
						},
						{
							label: 'OpenAPI editor',
							collapsed: true,
							items: [{ autogenerate: { directory: 'openapi' } }],
						},
						{
							label: 'Import & export',
							collapsed: true,
							items: [{ autogenerate: { directory: 'import-export' } }],
						},
						{
							label: 'Tools',
							collapsed: true,
							items: [{ autogenerate: { directory: 'tools' } }],
						},
						{
							label: 'Settings',
							collapsed: true,
							items: [{ autogenerate: { directory: 'settings' } }],
						},
					],
				},
				{
					label: 'JSON Explorer extension',
					collapsed: true,
					items: [{ autogenerate: { directory: 'json-explorer' } }],
				},
				{
					label: 'CLI',
					collapsed: true,
					items: [{ autogenerate: { directory: 'cli' } }],
				},
				{
					label: 'Desktop app',
					collapsed: true,
					items: [{ autogenerate: { directory: 'desktop' } }],
				},
				{
					label: 'Compare',
					collapsed: true,
					items: [
						{ label: 'Feature comparison', slug: 'compare' },
					],
				},
				{ label: 'Changelog', slug: 'changelog' },
			],
		}),
	],
});
