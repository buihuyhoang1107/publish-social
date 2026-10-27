import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig(({ mode }) => {
  const isLibrary = mode === 'library';

  if (isLibrary) {
    return {
      plugins: [
        react(),
        dts({
          insertTypesEntry: true, // Thêm field "types" vào package.json
          outDir: 'dist', // Xuất file .d.ts vào thư mục dist
        }),
      ],
      build: {
        lib: {
          entry: resolve(__dirname, 'src/index.ts'),
          name: 'SevagoSSO',
          fileName: (format) => `index.${format === 'es' ? 'esm' : format}.js`,
          formats: ['es', 'cjs'],
        },
        rollupOptions: {
          external: [
            //đảm bảo mọi peer (react, react-dom, formik, v.v.) không được bundle vào dist.
            'react',
            'react-dom',
            'react/jsx-runtime', // Bổ sung thêm react/jsx-runtime để tránh bundle React runtime
            '@emotion/react',
            '@emotion/styled',
            '@mui/material',
            '@mui/system',
            '@reduxjs/toolkit',
            'react-redux',
            'react-router-dom',
            'redux-persist',
            'formik',
            'yup',
            'dayjs',
            'framer-motion',
            'axios',
            'socket.io-client',
            'swr',
            'swr/infinite',
            '@microsoft/signalr',
            '@mui/x-date-pickers',
            'react-number-format',
            '@types/react-router-dom',
            'exceljs',
            'file-saver',
          ],
          output: {
            globals: {
              react: 'React',
              'react-dom': 'ReactDOM',
              'react/jsx-runtime': 'jsxRuntime',
              '@emotion/react': 'EmotionReact',
              '@emotion/styled': 'EmotionStyled',
              '@mui/material': 'MaterialUI',
              '@mui/system': 'MaterialUISystem',
              '@reduxjs/toolkit': 'ReduxToolkit',
              'react-redux': 'ReactRedux',
              'react-router-dom': 'ReactRouterDOM',
              'redux-persist': 'ReduxPersist',
              formik: 'Formik',
              yup: 'Yup',
              dayjs: 'dayjs',
              'framer-motion': 'FramerMotion',
              axios: 'axios',
              'socket.io-client': 'io',
              swr: 'SWR',
              '@microsoft/signalr': 'signalR',
              '@mui/x-date-pickers': 'MuiDatePickers',
              'react-number-format': 'ReactNumberFormat',
              exceljs: 'ExcelJS',
              'file-saver': 'FileSaver',
            },
          },
        },
        sourcemap: false,
        minify: 'esbuild',
        emptyOutDir: true,
      },
      resolve: {
        preserveSymlinks: false, // Quan trọng: đảm bảo React không bị duplicate khi link
      },
    };
  }

  // Cấu hình dev mode
  return {
    plugins: [react()],
    server: {
      port: 6003,
      strictPort: true, // Force sử dụng port này, không tự động tìm port khác
      host: true, // Cho phép truy cập từ bên ngoài
      open: true, // Tự động mở browser
    },
    preview: {
      port: 6003,
      host: true,
    },
  };
});
