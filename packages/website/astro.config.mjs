// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLinksValidator from 'starlight-links-validator';

// https://astro.build/config
export default defineConfig({
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
					label: 'Getting Started',
					collapsed: true,
					items: [
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
						{ label: 'VS Code vs Desktop', slug: 'getting-started/platforms' },
					],
				},
				{
					label: 'API Client',
					collapsed: false,
					items: [
						{
							label: 'Protocols & Collections',
							collapsed: true,
							items: [
								{ label: 'HTTP Requests', slug: 'features/http-requests' },
								{ label: 'GraphQL', slug: 'features/graphql' },
								{ label: 'WebSocket', slug: 'features/websocket' },
								{ label: 'Server-Sent Events', slug: 'features/sse' },
								{ label: 'gRPC', slug: 'features/grpc' },
								{ label: 'Collections', slug: 'features/collections' },
								{ label: 'Benchmarking', slug: 'features/benchmarking' },
							],
						},
						{
							label: 'Building Requests',
							collapsed: true,
							items: [{ autogenerate: { directory: 'building-requests' } }],
						},
						{
							label: 'Authentication',
							collapsed: true,
							items: [{ autogenerate: { directory: 'authentication' } }],
						},
						{
							label: 'Environments & Variables',
							collapsed: true,
							items: [{ autogenerate: { directory: 'variables' } }],
						},
						{
							label: 'Testing & Scripts',
							collapsed: true,
							items: [{ autogenerate: { directory: 'testing' } }],
						},
						{
							label: 'Response & Inspection',
							collapsed: true,
							items: [{ autogenerate: { directory: 'response' } }],
						},
						{
							label: 'OpenAPI Editor',
							collapsed: true,
							items: [{ autogenerate: { directory: 'openapi' } }],
						},
						{
							label: 'Import & Export',
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
					label: 'JSON Explorer Extension',
					collapsed: true,
					items: [{ autogenerate: { directory: 'json-explorer' } }],
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
				{ label: 'Changelog', slug: 'changelog' },
			],
		}),
	],
});
