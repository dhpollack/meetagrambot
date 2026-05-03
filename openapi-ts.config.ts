import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './api/openapi.json',
  output: {
    path: './src/api-client',
    format: false,
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    '@hey-api/sdk',
  ],
});
