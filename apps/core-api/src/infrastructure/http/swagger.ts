/** Definicion OpenAPI 3.0 para la API de diagnostico automotriz con autenticacion JWT. */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Intelligent Automotive Diagnostics API',
    version: '0.3.0',
    description:
      'API REST para diagnostico automotriz mediante telemetria OBD-II simulada. ' +
      'Soporta PIDs estandar SAE J1979 (Mode 01) y PIDs propietarios de fabricante (Mode 22). ' +
      'Autenticacion via JWT Bearer token.',
    contact: {
      name: 'Jesus Novillo',
      email: 'jesus.novillo@evenia.ad',
    },
  },
  servers: [{ url: 'http://localhost:4000', description: 'Local development' }],
  tags: [
    { name: 'Auth', description: 'Registro, login y refresh de tokens JWT' },
    { name: 'Diagnosis', description: 'Operaciones de diagnostico OBD-II' },
  ],
  paths: {
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new user',
        description: 'Registra un usuario particular o taller. Devuelve tokens JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RegisterRequest' } },
          },
        },
        responses: {
          '201': {
            description: 'User created',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } },
            },
          },
          '409': { description: 'Email already registered' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Autentica con email y password. Devuelve tokens JWT.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Login successful',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } },
            },
          },
          '401': { description: 'Invalid credentials' },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh access token',
        description:
          'Renueva el access token usando un refresh token valido. Rota el refresh token.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'New token pair',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/TokenPair' } },
            },
          },
          '401': { description: 'Invalid or expired refresh token' },
        },
      },
    },
    '/api/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get current user',
        description:
          'Devuelve el usuario autenticado a partir del access token JWT, sin passwordHash.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Current user profile',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/UserProfile' } },
            },
          },
          '401': { description: 'Access token required or invalid' },
          '404': { description: 'User not found' },
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Logout',
        description: 'Revoca el refresh token indicado para invalidar la sesion.',
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RefreshRequest' } },
          },
        },
        responses: {
          '200': {
            description: 'Logout successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { success: { type: 'boolean', example: true } },
                },
              },
            },
          },
          '400': { description: 'Validation error' },
        },
      },
    },
    '/api/scenarios': {
      get: {
        tags: ['Diagnosis'],
        summary: 'List available simulation scenarios',
        description: 'Returns all configured vehicle scenarios. Requires authentication.',
        security: [{ bearerAuth: [] }],
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
          '401': { description: 'Access token required' },
        },
      },
    },
    '/api/freeze-frame': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Get freeze frame for a DTC',
        description:
          'Returns the OBD-II freeze frame snapshot associated with the selected DTC. ' +
          'Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'scenarioId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Scenario ID (e.g. "audi-a3-idle")',
            example: 'audi-a3-idle',
          },
          {
            name: 'dtc',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'DTC code to filter by (e.g. "P0301"). Omit to get the scenario freeze frame.',
            example: 'P0301',
          },
        ],
        responses: {
          '200': {
            description: 'Freeze frame for the DTC (or null when none matches)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    freezeFrame: {
                      $ref: '#/components/schemas/FreezeFrame',
                    },
                  },
                },
              },
            },
          },
          '401': { description: 'Access token required' },
          '404': { description: 'Scenario not found' },
        },
      },
    },
    '/api/diagnosis': {
      post: {
        tags: ['Diagnosis'],
        summary: 'Run vehicle diagnosis',
        description:
          'Executes a deterministic diagnosis on the selected scenario. Requires authentication.',
        security: [{ bearerAuth: [] }],
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
          '401': { description: 'Access token required' },
          '404': { description: 'Scenario not found' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenido en /api/auth/login o /api/auth/register',
      },
    },
    schemas: {
      RegisterRequest: {
        type: 'object',
        required: ['username', 'email', 'password', 'userType'],
        properties: {
          username: { type: 'string', minLength: 3, maxLength: 50, example: 'juan' },
          email: { type: 'string', format: 'email', example: 'juan@test.com' },
          password: { type: 'string', minLength: 8, example: 'Pass1234!' },
          userType: { type: 'string', enum: ['individual', 'workshop'], example: 'workshop' },
          businessName: { type: 'string', example: 'Talleres AutoFix' },
          taxId: { type: 'string', example: 'B12345678' },
          address: { type: 'string', example: 'Calle 123' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'juan@test.com' },
          password: { type: 'string', example: 'Pass1234!' },
        },
      },
      RefreshRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          email: { type: 'string' },
          userType: { type: 'string', enum: ['individual', 'workshop'] },
          businessName: { type: 'string', nullable: true },
          taxId: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          createdAt: { type: 'string' },
          isWorkshop: { type: 'boolean' },
        },
      },
      TokenPair: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              username: { type: 'string' },
              email: { type: 'string' },
              userType: { type: 'string' },
              businessName: { type: 'string', nullable: true },
              taxId: { type: 'string', nullable: true },
              address: { type: 'string', nullable: true },
              createdAt: { type: 'string' },
            },
          },
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
        },
      },
      Scenario: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'audi-a3-idle' },
          name: { type: 'string', example: 'Audi A3 al ralenti' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
          sensorValues: { $ref: '#/components/schemas/LiveData' },
          dtcConfig: { type: 'array', items: { $ref: '#/components/schemas/DtcCode' } },
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
          dtcCodes: { type: 'array', items: { $ref: '#/components/schemas/DtcCode' } },
          diagnosisText: { type: 'string', example: '[HIGH] P0301' },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            example: 'high',
          },
        },
      },
      FreezeFrame: {
        type: 'object',
        nullable: true,
        properties: {
          dtcCode: { type: 'string', example: 'P0301' },
          pidValues: {
            type: 'object',
            additionalProperties: { type: 'number' },
            example: { '0C': 850 },
          },
        },
      },
    },
  },
} as const
