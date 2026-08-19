import dotenv from 'dotenv'
import { resolveEnvFilePath } from '@/infrastructure/configuration/envFile.js'

dotenv.config({ path: resolveEnvFilePath(import.meta.url) })

import { loadConfig, assertProductionSecrets } from '@/infrastructure/configuration/index.js'
import { buildApp } from '@/infrastructure/composition/composition.js'

const config = loadConfig()
assertProductionSecrets(config)

const app = await buildApp(config)

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT} (OBD_MODE=${config.OBD_MODE})`)
})
