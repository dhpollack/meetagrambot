import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './api/openapi.json',
  output: {
    path: './src/api-client',
    postProcess: ['biome:format'],
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/typescript',
    {
      dates: true,
      name: '@hey-api/transformers',
    },
    {
      name: '@hey-api/sdk',
      transformer: true,
    }
  ],
});
