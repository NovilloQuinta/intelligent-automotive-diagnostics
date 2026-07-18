/** Definición OpenAPI 3.0 para la API de diagnóstico automotriz. */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Intelligent Automotive Diagnostics API',
    version: '0.2.0',
    description:
      'API REST para diagnóstico automotriz mediante telemetría OBD-II simulada. ' +
      'Soporta PIDs estándar SAE J1979 (Mode 01) y PIDs propietarios de fabricante (Mode 22).',
    contact: {
      name: 'Jesús Novillo',
      email: 'jesus.novillo@evenia.ad',
    },
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Local development' },
  ],
  tags: [
    { name: 'Diagnosis', description: 'Operaciones de diagnóstico OBD-II' },
  ],
  paths: {
    '/api/scenarios': {
      get: {
        tags: ['Diagnosis'],
        summary: 'List available simulation scenarios',
        description: 'Returns all configured vehicle scenarios with their sensor values and DTC config.',
        responses: {
          '200': {
            description: 'List of scenarios',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    scenarios: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Scenario' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/diagnosis': {
      post: {
        tags: ['Diagnosis'],
        summary: 'Run vehicle diagnosis',
        description:
          'Executes a deterministic diagnosis on the selected scenario. ' +
          'Reads RPM, coolant temp, speed, intake temp via Mode 01 PIDs, ' +
          'checks for DTCs and freeze frame data, and returns a severity assessment.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['scenarioId'],
                properties: {
                  scenarioId: {
                    type: 'string',
                    description: 'Scenario ID (e.g. "audi-a3-idle", "kawa-z900")',
                    example: 'audi-a3-idle',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Diagnosis result',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DiagnosisResult' },
              },
            },
          },
          '404': {
            description: 'Scenario not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string', example: 'Scenario not found' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Scenario: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'audi-a3-idle' },
          name: { type: 'string', example: 'Audi A3 al ralentí' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
          sensorValues: { $ref: '#/components/schemas/LiveData' },
          dtcConfig: {
            type: 'array',
            items: { $ref: '#/components/schemas/DtcCode' },
          },
          vehicleInfo: { $ref: '#/components/schemas/VehicleInfo' },
        },
      },
      LiveData: {
        type: 'object',
        properties: {
          rpm: { type: 'number', example: 750 },
          coolantTemp: { type: 'number', example: 90 },
          speed: { type: 'number', example: 0 },
          intakeTemp: { type: 'number', example: 25 },
        },
      },
      DtcCode: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'P0301' },
          description: { type: 'string', example: 'Cylinder 1 Misfire' },
        },
      },
      VehicleInfo: {
        type: 'object',
        properties: {
          make: { type: 'string', example: 'Audi' },
          model: { type: 'string', example: 'A3' },
          year: { type: 'integer', example: 2018 },
          engineType: { type: 'string', example: '2.0 TFSI' },
          vin: { type: 'string', example: 'WAUZZZ8V5JA123456' },
        },
      },
      DiagnosisResult: {
        type: 'object',
        properties: {
          rawData: { type: 'string', example: '{"rpm":750,"coolantTemp":90,...}' },
          parsedValues: { $ref: '#/components/schemas/LiveData' },
          dtcCodes: {
            type: 'array',
            items: { $ref: '#/components/schemas/DtcCode' },
          },
          diagnosisText: { type: 'string', example: '[HIGH] P0301' },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            example: 'high',
          },
        },
      },
    },
  },
} as const
