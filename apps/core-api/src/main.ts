import dotenv from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') })

import { loadConfig, assertProductionSecrets } from '@/infrastructure/configuration/index.js'
import { buildApp } from '@/infrastructure/composition/composition.js'

const config = loadConfig()
assertProductionSecrets(config)

const app = await buildApp(config)

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT} (OBD_MODE=${config.OBD_MODE})`)
})
