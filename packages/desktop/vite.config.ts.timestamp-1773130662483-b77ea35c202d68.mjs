// vite.config.ts
import { defineConfig } from "file:///D:/DevWorkspace/rest-clients/Plan/RestEase/node_modules/.pnpm/vite@5.4.21_@types+node@18.19.130/node_modules/vite/dist/node/index.js";
import { svelte } from "file:///D:/DevWorkspace/rest-clients/Plan/RestEase/node_modules/.pnpm/@sveltejs+vite-plugin-svelte@4.0.4_svelte@5.51.2_vite@5.4.21_@types+node@18.19.130_/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import { resolve } from "path";
var __vite_injected_original_dirname = "D:\\DevWorkspace\\rest-clients\\Plan\\RestEase\\packages\\desktop";
var vite_config_default = defineConfig({
  plugins: [svelte()],
  base: "./",
  // Resolve aliases to use existing UI components and core packages
  resolve: {
    alias: {
      "@hivefetch/core": resolve(__vite_injected_original_dirname, "../core/src"),
      "@hivefetch/transport": resolve(__vite_injected_original_dirname, "../transport/src"),
      "@hivefetch/ui": resolve(__vite_injected_original_dirname, "../ui/src")
    }
  },
  // Tauri expects the output in dist/ folder
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        main: resolve(__vite_injected_original_dirname, "index.html")
      }
    }
  },
  // Prevent vite from obscuring rust errors
  clearScreen: false,
  // Tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"]
    }
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxEZXZXb3Jrc3BhY2VcXFxccmVzdC1jbGllbnRzXFxcXFBsYW5cXFxcUmVzdEVhc2VcXFxccGFja2FnZXNcXFxcZGVza3RvcFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcRGV2V29ya3NwYWNlXFxcXHJlc3QtY2xpZW50c1xcXFxQbGFuXFxcXFJlc3RFYXNlXFxcXHBhY2thZ2VzXFxcXGRlc2t0b3BcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0RldldvcmtzcGFjZS9yZXN0LWNsaWVudHMvUGxhbi9SZXN0RWFzZS9wYWNrYWdlcy9kZXNrdG9wL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCB7IHN2ZWx0ZSB9IGZyb20gJ0BzdmVsdGVqcy92aXRlLXBsdWdpbi1zdmVsdGUnO1xyXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtzdmVsdGUoKV0sXHJcbiAgYmFzZTogJy4vJyxcclxuXHJcbiAgLy8gUmVzb2x2ZSBhbGlhc2VzIHRvIHVzZSBleGlzdGluZyBVSSBjb21wb25lbnRzIGFuZCBjb3JlIHBhY2thZ2VzXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgYWxpYXM6IHtcclxuICAgICAgJ0BoaXZlZmV0Y2gvY29yZSc6IHJlc29sdmUoX19kaXJuYW1lLCAnLi4vY29yZS9zcmMnKSxcclxuICAgICAgJ0BoaXZlZmV0Y2gvdHJhbnNwb3J0JzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuLi90cmFuc3BvcnQvc3JjJyksXHJcbiAgICAgICdAaGl2ZWZldGNoL3VpJzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuLi91aS9zcmMnKSxcclxuICAgIH0sXHJcbiAgfSxcclxuXHJcbiAgLy8gVGF1cmkgZXhwZWN0cyB0aGUgb3V0cHV0IGluIGRpc3QvIGZvbGRlclxyXG4gIGJ1aWxkOiB7XHJcbiAgICBvdXREaXI6ICdkaXN0JyxcclxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxyXG4gICAgc291cmNlbWFwOiB0cnVlLFxyXG4gICAgcm9sbHVwT3B0aW9uczoge1xyXG4gICAgICBpbnB1dDoge1xyXG4gICAgICAgIG1haW46IHJlc29sdmUoX19kaXJuYW1lLCAnaW5kZXguaHRtbCcpLFxyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICB9LFxyXG5cclxuICAvLyBQcmV2ZW50IHZpdGUgZnJvbSBvYnNjdXJpbmcgcnVzdCBlcnJvcnNcclxuICBjbGVhclNjcmVlbjogZmFsc2UsXHJcblxyXG4gIC8vIFRhdXJpIGV4cGVjdHMgYSBmaXhlZCBwb3J0LCBmYWlsIGlmIHRoYXQgcG9ydCBpcyBub3QgYXZhaWxhYmxlXHJcbiAgc2VydmVyOiB7XHJcbiAgICBwb3J0OiA1MTc0LFxyXG4gICAgc3RyaWN0UG9ydDogdHJ1ZSxcclxuICAgIHdhdGNoOiB7XHJcbiAgICAgIC8vIFRlbGwgdml0ZSB0byBpZ25vcmUgd2F0Y2hpbmcgYHNyYy10YXVyaWBcclxuICAgICAgaWdub3JlZDogWycqKi9zcmMtdGF1cmkvKionXSxcclxuICAgIH0sXHJcbiAgfSxcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBaVgsU0FBUyxvQkFBb0I7QUFDOVksU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUZ4QixJQUFNLG1DQUFtQztBQUt6QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsT0FBTyxDQUFDO0FBQUEsRUFDbEIsTUFBTTtBQUFBO0FBQUEsRUFHTixTQUFTO0FBQUEsSUFDUCxPQUFPO0FBQUEsTUFDTCxtQkFBbUIsUUFBUSxrQ0FBVyxhQUFhO0FBQUEsTUFDbkQsd0JBQXdCLFFBQVEsa0NBQVcsa0JBQWtCO0FBQUEsTUFDN0QsaUJBQWlCLFFBQVEsa0NBQVcsV0FBVztBQUFBLElBQ2pEO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsSUFDYixXQUFXO0FBQUEsSUFDWCxlQUFlO0FBQUEsTUFDYixPQUFPO0FBQUEsUUFDTCxNQUFNLFFBQVEsa0NBQVcsWUFBWTtBQUFBLE1BQ3ZDO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQTtBQUFBLEVBR0EsYUFBYTtBQUFBO0FBQUEsRUFHYixRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixPQUFPO0FBQUE7QUFBQSxNQUVMLFNBQVMsQ0FBQyxpQkFBaUI7QUFBQSxJQUM3QjtBQUFBLEVBQ0Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
