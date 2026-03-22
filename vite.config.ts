import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');

    const setupProxy = (middlewares: any) => {
        // Universal Proxy for dynamic API endpoints
        middlewares.use('/api/universal-proxy', async (req: any, res: any, next: any) => {
           if (req.method === 'OPTIONS') {
               res.setHeader('Access-Control-Allow-Origin', '*');
               res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
               res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Target-URL');
               res.statusCode = 200;
               res.end();
               return;
           }

           const targetUrl = req.headers['x-target-url'] as string;
           if (!targetUrl) {
               if (req.url === '/') { 
                    res.statusCode = 400;
                    res.end('Missing X-Target-URL header');
                    return;
               }
               return next();
           }

           try {
             console.log(`[Universal Proxy] ${req.method} -> ${targetUrl}`);

             const chunks: any[] = [];
             for await (const chunk of req) {
               chunks.push(chunk);
             }
             const body = chunks.length > 0 ? Buffer.concat(chunks) : undefined;

             const headers = new Headers();
             for (const [key, value] of Object.entries(req.headers as Record<string, string | string[]>)) {
                if (!['host', 'origin', 'content-length', 'connection', 'x-target-url'].includes(key.toLowerCase())) {
                    if (Array.isArray(value)) {
                        value.forEach(v => headers.append(key, v));
                    } else if (value) {
                        headers.append(key, value);
                    }
                }
             }

             const response = await fetch(targetUrl, {
                 method: req.method,
                 headers: headers,
                 body: body
             });

             console.log(`[Universal Proxy] Response from ${targetUrl}: ${response.status} ${response.statusText}`);

            res.statusCode = response.status;
            res.statusMessage = response.statusText;
            
            response.headers.forEach((value, key) => {
                const lowerKey = key.toLowerCase();
                if (['access-control-allow-origin', 'content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lowerKey)) {
                    return;
                }
                res.setHeader(key, value);
            });
            
            res.setHeader('Access-Control-Allow-Origin', '*');
             
             const arrayBuffer = await response.arrayBuffer();
             
             if (response.status !== 200) {
                 const text = Buffer.from(arrayBuffer).toString();
                 console.log(`[Universal Proxy] Error body from ${targetUrl}:`, text);
             }

             res.end(Buffer.from(arrayBuffer));

           } catch (e: any) {
             console.error('[Universal Proxy] Error:', e);
             res.statusCode = 500;
             res.setHeader('Access-Control-Allow-Origin', '*');
             res.end(`Proxy error: ${e.message}`);
           }
        });

        middlewares.use('/api/proxy', async (req: any, res: any, next: any) => {
           try {
             const urlObj = new URL(req.url!, `http://${req.headers.host}`);
             const targetUrl = urlObj.searchParams.get('url');
             
             if (!targetUrl) {
               res.statusCode = 400;
               res.end('Missing url param');
               return;
             }

             console.log(`[Proxy] Fetching: ${targetUrl}`);
             const response = await fetch(targetUrl);
             
             if (!response.ok) {
                 throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
             }

             const contentType = response.headers.get('content-type');
             if (contentType) res.setHeader('Content-Type', contentType);
             res.setHeader('Access-Control-Allow-Origin', '*');
             
             const arrayBuffer = await response.arrayBuffer();
             res.end(Buffer.from(arrayBuffer));
           } catch (e) {
             console.error('[Proxy] Error:', e);
             res.statusCode = 500;
             res.end(`Proxy error: ${e}`);
           }
        });
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api': {
            target: 'http://localhost:4000',
            changeOrigin: true,
          },
        },
      },
      build: {
        rollupOptions: {
          output: {
            // 手动分块策略，优化加载性能
            manualChunks: {
              // 核心 React 库
              vendor: ['react', 'react-dom', 'react-router-dom'],
              // UI 组件库和动画
              ui: ['@heroui/react', 'framer-motion'],
              // 拖拽库
              dnd: ['@dnd-kit/core', '@dnd-kit/sortable'],
              // 工具库
              utils: ['jszip', 'lucide-react'],
              // 注意: @excalidraw/excalidraw 已通过 React.lazy() 懒加载
              // 如需进一步优化，可添加以下配置将其单独分包：
              // excalidraw: ['@excalidraw/excalidraw'],
            },
          },
        },
        // 启用压缩和源码映射
        sourcemap: false,
        minify: 'esbuild',
        // 拆分 chunk 大小警告阈值
        chunkSizeWarningLimit: 1000,
      },
      plugins: [
        react(),
        {
          name: 'file-server-middleware',
          configureServer(server) {
            setupProxy(server.middlewares);
          },
          configurePreviewServer(server) {
            setupProxy(server.middlewares);
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
