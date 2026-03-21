// vite.config.ts
import { defineConfig } from "file:///D:/DevWorkspace/rest-clients/Plan/RestEase/node_modules/.pnpm/vite@5.4.21_@types+node@24.12.0/node_modules/vite/dist/node/index.js";
import { svelte } from "file:///D:/DevWorkspace/rest-clients/Plan/RestEase/node_modules/.pnpm/@sveltejs+vite-plugin-svelte@4.0.4_svelte@5.51.2_vite@5.4.21_@types+node@24.12.0_/node_modules/@sveltejs/vite-plugin-svelte/src/index.js";
import { resolve } from "path";
var __vite_injected_original_dirname = "D:\\DevWorkspace\\rest-clients\\Plan\\RestEase\\packages\\desktop";
var vite_config_default = defineConfig({
  plugins: [svelte()],
  base: "./",
  // Resolve aliases to use existing UI components and core packages
  resolve: {
    extensions: [".mjs", ".js", ".mts", ".ts", ".jsx", ".tsx", ".json", ".svelte.ts", ".svelte"],
    alias: {
      "@nouto/core": resolve(__vite_injected_original_dirname, "../core/src"),
      "@nouto/transport": resolve(__vite_injected_original_dirname, "../transport/src"),
      "@nouto/ui": resolve(__vite_injected_original_dirname, "../ui/src")
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxEZXZXb3Jrc3BhY2VcXFxccmVzdC1jbGllbnRzXFxcXFBsYW5cXFxcUmVzdEVhc2VcXFxccGFja2FnZXNcXFxcZGVza3RvcFwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRDpcXFxcRGV2V29ya3NwYWNlXFxcXHJlc3QtY2xpZW50c1xcXFxQbGFuXFxcXFJlc3RFYXNlXFxcXHBhY2thZ2VzXFxcXGRlc2t0b3BcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Q6L0RldldvcmtzcGFjZS9yZXN0LWNsaWVudHMvUGxhbi9SZXN0RWFzZS9wYWNrYWdlcy9kZXNrdG9wL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCB7IHN2ZWx0ZSB9IGZyb20gJ0BzdmVsdGVqcy92aXRlLXBsdWdpbi1zdmVsdGUnO1xyXG5pbXBvcnQgeyByZXNvbHZlIH0gZnJvbSAncGF0aCc7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtzdmVsdGUoKV0sXHJcbiAgYmFzZTogJy4vJyxcclxuXHJcbiAgLy8gUmVzb2x2ZSBhbGlhc2VzIHRvIHVzZSBleGlzdGluZyBVSSBjb21wb25lbnRzIGFuZCBjb3JlIHBhY2thZ2VzXHJcbiAgcmVzb2x2ZToge1xyXG4gICAgZXh0ZW5zaW9uczogWycubWpzJywgJy5qcycsICcubXRzJywgJy50cycsICcuanN4JywgJy50c3gnLCAnLmpzb24nLCAnLnN2ZWx0ZS50cycsICcuc3ZlbHRlJ10sXHJcbiAgICBhbGlhczoge1xyXG4gICAgICAnQG5vdXRvL2NvcmUnOiByZXNvbHZlKF9fZGlybmFtZSwgJy4uL2NvcmUvc3JjJyksXHJcbiAgICAgICdAbm91dG8vdHJhbnNwb3J0JzogcmVzb2x2ZShfX2Rpcm5hbWUsICcuLi90cmFuc3BvcnQvc3JjJyksXHJcbiAgICAgICdAbm91dG8vdWknOiByZXNvbHZlKF9fZGlybmFtZSwgJy4uL3VpL3NyYycpLFxyXG4gICAgfSxcclxuICB9LFxyXG5cclxuICAvLyBUYXVyaSBleHBlY3RzIHRoZSBvdXRwdXQgaW4gZGlzdC8gZm9sZGVyXHJcbiAgYnVpbGQ6IHtcclxuICAgIG91dERpcjogJ2Rpc3QnLFxyXG4gICAgZW1wdHlPdXREaXI6IHRydWUsXHJcbiAgICBzb3VyY2VtYXA6IHRydWUsXHJcbiAgICByb2xsdXBPcHRpb25zOiB7XHJcbiAgICAgIGlucHV0OiB7XHJcbiAgICAgICAgbWFpbjogcmVzb2x2ZShfX2Rpcm5hbWUsICdpbmRleC5odG1sJyksXHJcbiAgICAgIH0sXHJcbiAgICB9LFxyXG4gIH0sXHJcblxyXG4gIC8vIFByZXZlbnQgdml0ZSBmcm9tIG9ic2N1cmluZyBydXN0IGVycm9yc1xyXG4gIGNsZWFyU2NyZWVuOiBmYWxzZSxcclxuXHJcbiAgLy8gVGF1cmkgZXhwZWN0cyBhIGZpeGVkIHBvcnQsIGZhaWwgaWYgdGhhdCBwb3J0IGlzIG5vdCBhdmFpbGFibGVcclxuICBzZXJ2ZXI6IHtcclxuICAgIHBvcnQ6IDUxNzQsXHJcbiAgICBzdHJpY3RQb3J0OiB0cnVlLFxyXG4gICAgd2F0Y2g6IHtcclxuICAgICAgLy8gVGVsbCB2aXRlIHRvIGlnbm9yZSB3YXRjaGluZyBgc3JjLXRhdXJpYFxyXG4gICAgICBpZ25vcmVkOiBbJyoqL3NyYy10YXVyaS8qKiddLFxyXG4gICAgfSxcclxuICB9LFxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFpWCxTQUFTLG9CQUFvQjtBQUM5WSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxlQUFlO0FBRnhCLElBQU0sbUNBQW1DO0FBS3pDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxPQUFPLENBQUM7QUFBQSxFQUNsQixNQUFNO0FBQUE7QUFBQSxFQUdOLFNBQVM7QUFBQSxJQUNQLFlBQVksQ0FBQyxRQUFRLE9BQU8sUUFBUSxPQUFPLFFBQVEsUUFBUSxTQUFTLGNBQWMsU0FBUztBQUFBLElBQzNGLE9BQU87QUFBQSxNQUNMLGVBQWUsUUFBUSxrQ0FBVyxhQUFhO0FBQUEsTUFDL0Msb0JBQW9CLFFBQVEsa0NBQVcsa0JBQWtCO0FBQUEsTUFDekQsYUFBYSxRQUFRLGtDQUFXLFdBQVc7QUFBQSxJQUM3QztBQUFBLEVBQ0Y7QUFBQTtBQUFBLEVBR0EsT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsYUFBYTtBQUFBLElBQ2IsV0FBVztBQUFBLElBQ1gsZUFBZTtBQUFBLE1BQ2IsT0FBTztBQUFBLFFBQ0wsTUFBTSxRQUFRLGtDQUFXLFlBQVk7QUFBQSxNQUN2QztBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUE7QUFBQSxFQUdBLGFBQWE7QUFBQTtBQUFBLEVBR2IsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLElBQ1osT0FBTztBQUFBO0FBQUEsTUFFTCxTQUFTLENBQUMsaUJBQWlCO0FBQUEsSUFDN0I7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
