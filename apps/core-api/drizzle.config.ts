import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: './src/infrastructure/persistence/sqlite/schema.ts',
  dialect: 'sqlite',
  dbCredentials: {
    url: './data/diagnostics.db',
  },
})
