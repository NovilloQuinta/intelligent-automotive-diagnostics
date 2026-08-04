import { loadConfig, assertProductionSecrets } from '@/infrastructure/configuration/index.js'
import { buildApp } from '@/infrastructure/composition/index.js'

const config = loadConfig()
assertProductionSecrets(config)

const app = buildApp(config)

app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT} (OBD_MODE=${config.OBD_MODE})`)
})
