import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'
import autoprefixer from 'autoprefixer'

function pluginGenerarSw() {
  return {
    name: 'generar-sw',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const archivos = Object.keys(bundle).filter(
        (archivo) => !archivo.endsWith('.map') && archivo !== 'sw.js',
      )
      const plantilla = fs.readFileSync(path.resolve(__dirname, 'src/sw.js'), 'utf8')
      const fuente = plantilla
        .replace("'__CACHE__'", JSON.stringify(`pos-shell-${Date.now()}`))
        .replaceAll('__ASSETS__', JSON.stringify(archivos))
      if (fuente.includes('__ASSETS__') || fuente.includes("'__CACHE__'")) {
        throw new Error('generar-sw: la plantilla src/sw.js no quedó completa')
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: fuente })
    },
  }
}

export default defineConfig(() => {
  return {
    base: './',
    build: {
      outDir: 'build',
    },
    css: {
      postcss: {
        plugins: [
          autoprefixer({}), // add options if needed
        ],
      },
    },
    plugins: [react(), pluginGenerarSw()],
    resolve: {
      alias: [
        {
          find: 'src/',
          replacement: `${path.resolve(__dirname, 'src')}/`,
        },
      ],
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.scss'],
    },
    server: {
      port: 3000,
      proxy: {
        // https://vitejs.dev/config/server-options.html
      },
    },
  }
})
