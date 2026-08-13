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
    {
      name: 'Admin',
      description:
        'Panel de administracion: logs, auditoria HTTP, usuarios y catalogo vectorial. ' +
        'Requiere rol admin (403 en caso contrario) y tiene su propio rate limit.',
    },
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
    '/api/mcp/capabilities': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Report diagnostic capabilities',
        description:
          'Returns whether cognitive (LLM-based) diagnosis is available. Requires authentication.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Capabilities object',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    cognitiveDiagnosis: {
                      type: 'boolean',
                      description: 'Whether cognitive diagnosis is available',
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
    '/api/available-pids': {
      get: {
        tags: ['Diagnosis'],
        summary: 'List selectable Mode 01 PIDs',
        description:
          'Returns the SAE J1979 Mode 01 PIDs available for the live-telemetry selector, with name and unit. Requires authentication.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of available Mode 01 PIDs',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    pids: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/AvailablePid' },
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
    '/api/vehicle-info': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Identify the active vehicle',
        description:
          'Reads the VIN and vehicle data of the selected scenario (or of the directly ' +
          'connected ELM327) and decorates them with the fields decoded from the VIN ' +
          '(manufacturer, region, model year). Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'scenarioId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Scenario ID (e.g. "audi-a3-idle"). Optional in direct TCP mode.',
            example: 'audi-a3-idle',
          },
        ],
        responses: {
          '200': {
            description:
              'Identified vehicle. Decoded fields are null when the VIN is not decodable.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    vin: { type: 'string', example: 'WAUZZZ8V5JA123456' },
                    make: { type: 'string', example: 'Audi' },
                    model: { type: 'string', example: 'A3' },
                    year: { type: 'integer', example: 2018 },
                    engineType: { type: 'string', example: '2.0 TFSI' },
                    manufacturer: { type: 'string', nullable: true, example: 'Audi' },
                    region: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        country: { type: 'string', example: 'Germany' },
                        region: { type: 'string', example: 'Europe' },
                      },
                    },
                    modelYearDecoded: { type: 'integer', nullable: true, example: 2018 },
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
    '/api/live-data': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Get live telemetry (dynamic PIDs)',
        description:
          'Returns live telemetry for the requested Mode 01 PIDs (or the 4 default dashboard ' +
          'PIDs when `pids` is omitted). Values are null when a PID read fails. ' +
          'Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'scenarioId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Scenario ID (e.g. "audi-a3-idle"). Optional in direct TCP mode.',
            example: 'audi-a3-idle',
          },
          {
            name: 'pids',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description:
              'Comma-separated Mode 01 PID codes (max 8), e.g. "0C,0D,05". ' +
              'Omit for the 4 default PIDs (rpm, coolantTemp, speed, intakeTemp).',
            example: '0C,0D,05',
          },
        ],
        responses: {
          '200': {
            description:
              'Live telemetry: the named fields (rpm/coolantTemp/speed/intakeTemp) for the PIDs ' +
              'with a dedicated gauge, plus a generic `readings` array with one entry per ' +
              'requested PID (code, name, unit, value). Values are null when a PID read fails.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    rpm: { type: 'number', nullable: true, example: 750 },
                    coolantTemp: { type: 'number', nullable: true, example: 90 },
                    speed: { type: 'number', nullable: true, example: 0 },
                    intakeTemp: { type: 'number', nullable: true, example: 25 },
                    readings: {
                      type: 'array',
                      description:
                        'Generic reading per requested PID, enriched with name/unit from the ' +
                        'standard Mode 01 catalog.',
                      items: {
                        type: 'object',
                        properties: {
                          code: { type: 'string', example: '01 0C' },
                          name: { type: 'string', example: 'Engine RPM' },
                          unit: { type: 'string', example: 'rpm' },
                          value: { type: 'number', nullable: true, example: 750 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid query parameters (bad PID code or more than 8 PIDs)' },
          '401': { description: 'Access token required' },
          '404': { description: 'Scenario not found' },
        },
      },
    },
    '/api/ecu-info': {
      get: {
        tags: ['Diagnosis'],
        summary: 'List discovered ECUs',
        description:
          'Returns the electronic control units discovered on the vehicle CAN/OBD bus ' +
          'for the selected scenario. Requires authentication.',
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
        ],
        responses: {
          '200': {
            description: 'ECUs discovered for the scenario (empty array when none)',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ecus: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/EcuInfo' },
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
    '/api/clear-dtc': {
      post: {
        tags: ['Diagnosis'],
        summary: 'Clear stored DTC codes and freeze frame data',
        description:
          'Clears diagnostic trouble codes and stored sensor values (Mode 04). ' +
          'Requires authentication.',
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
                    description: 'Scenario ID (e.g. "audi-a3-idle"). Optional in TCP direct mode.',
                    example: 'audi-a3-idle',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'DTCs cleared successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { cleared: { type: 'boolean', example: true } },
                },
              },
            },
          },
          '401': { description: 'Access token required' },
          '404': { description: 'Scenario not found' },
        },
      },
    },
    '/api/pending-dtc': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Read pending DTC codes (Mode 07)',
        description:
          'Returns pending (not yet confirmed) diagnostic trouble codes. ' +
          'Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'scenarioId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Scenario ID (e.g. "audi-a3-idle"). Optional in TCP direct mode.',
            example: 'audi-a3-idle',
          },
        ],
        responses: {
          '200': {
            description: 'Pending DTC codes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dtcCodes: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/DtcCode' },
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
    '/api/permanent-dtc': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Read permanent DTC codes (Mode 0A)',
        description:
          'Returns permanent diagnostic trouble codes that cannot be cleared with Mode 04. ' +
          'Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'scenarioId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Scenario ID (e.g. "audi-a3-idle"). Optional in TCP direct mode.',
            example: 'audi-a3-idle',
          },
        ],
        responses: {
          '200': {
            description: 'Permanent DTC codes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dtcCodes: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/DtcCode' },
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
    '/api/vehicle-status': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Get MIL status and emissions monitors (Mode 01 PID 01)',
        description:
          'Returns the status of the Malfunction Indicator Lamp (MIL), stored DTC count, ' +
          'engine type, and the supported/completed emissions monitors. Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'scenarioId',
            in: 'query',
            required: true,
            schema: { type: 'string' },
            description: 'Scenario ID (e.g. "audi-a3-idle"). Optional in TCP direct mode.',
            example: 'audi-a3-idle',
          },
        ],
        responses: {
          '200': {
            description: 'Vehicle status with MIL, DTCs, and monitors',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    milOn: { type: 'boolean', example: true },
                    dtcCount: { type: 'integer', example: 3 },
                    engineType: {
                      type: 'string',
                      enum: ['spark', 'compression'],
                      example: 'spark',
                    },
                    monitors: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          name: { type: 'string', example: 'misfire' },
                          supported: { type: 'boolean', example: true },
                          completed: { type: 'boolean', example: true },
                        },
                      },
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
    '/api/diagnosis-history': {
      get: {
        tags: ['Diagnosis'],
        summary: 'List diagnosis sessions of the authenticated user',
        description:
          'Paginated, date-filtered listing of past diagnosis sessions. ' +
          'All filters are resolved in SQL, never in memory. ' +
          'Always filtered by the authenticated user (taken from JWT, not query). ' +
          'The list never includes `resultJson`. Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'from',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            description: 'Start date-time in ISO 8601 UTC',
          },
          {
            name: 'to',
            in: 'query',
            schema: { type: 'string', format: 'date-time' },
            description: 'End date-time in ISO 8601 UTC',
          },
          {
            name: 'scenarioId',
            in: 'query',
            schema: { type: 'string' },
            description: 'Filter by scenario ID',
          },
          {
            name: 'severity',
            in: 'query',
            schema: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            description: 'Filter by diagnosis severity',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 25, minimum: 1, maximum: 100 },
            description: 'Page size',
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', default: 0, minimum: 0 },
            description: 'Pagination offset',
          },
        ],
        responses: {
          '200': {
            description: 'Paginated session list (without resultJson)',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DiagnosisSessionList' },
              },
            },
          },
          '400': { description: 'Invalid query parameters or from > to' },
          '401': { description: 'Access token required' },
          '429': { description: 'Too many history requests' },
        },
      },
    },
    '/api/diagnosis-history/{id}': {
      get: {
        tags: ['Diagnosis'],
        summary: 'Get a specific diagnosis session detail',
        description:
          'Returns the full session including `resultJson` (the immutable snapshot). ' +
          'Returns 404 if the session does not exist OR belongs to another user. ' +
          'Requires authentication.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'Session ID',
          },
        ],
        responses: {
          '200': {
            description: 'Full session detail',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/DiagnosisSessionDetail' },
              },
            },
          },
          '404': { description: 'Session not found or belongs to another user' },
          '401': { description: 'Access token required' },
          '429': { description: 'Too many history requests' },
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
    '/api/admin/overview': {
      get: {
        tags: ['Admin'],
        summary: 'Admin panel overview',
        description:
          'Aggregated snapshot for the admin panel: user totals, recent error count, and ' +
          'HTTP activity by path. Requires admin role.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Overview summary',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AdminOverview' } },
            },
          },
          '401': { description: 'Access token required' },
          '403': { description: 'Admin role required' },
          '429': { description: 'Too many requests to /api/admin' },
        },
      },
    },
    '/api/admin/logs': {
      get: {
        tags: ['Admin'],
        summary: 'List application logs',
        description:
          'Paginated, filtered, date-descending listing of the `logs` table. Requires admin role.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'level',
            in: 'query',
            schema: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          {
            name: 'q',
            in: 'query',
            description: 'Free-text search over the log message',
            schema: { type: 'string' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated log entries',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AdminLogsPage' } },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Access token required' },
          '403': { description: 'Admin role required' },
        },
      },
    },
    '/api/admin/audit-logs': {
      get: {
        tags: ['Admin'],
        summary: 'List HTTP audit records',
        description:
          'Paginated, filtered, date-descending listing of the `audit_logs` table. ' +
          'Requires admin role. Routes under /api/admin are never audited (self-exclusion).',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'statusCode',
            in: 'query',
            schema: { type: 'integer', minimum: 100, maximum: 599 },
          },
          { name: 'path', in: 'query', schema: { type: 'string' } },
          { name: 'userId', in: 'query', schema: { type: 'integer' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          {
            name: 'q',
            in: 'query',
            description: 'Free-text search over path',
            schema: { type: 'string' },
          },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated audit entries',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AdminAuditLogsPage' } },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Access token required' },
          '403': { description: 'Admin role required' },
        },
      },
    },
    '/api/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'List users',
        description:
          'Paginated, filtered listing of users. Never includes `passwordHash` (same ' +
          'projection as `safeUser`/`/api/auth/me`). Requires admin role.',
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: 'q',
            in: 'query',
            description: 'Free-text search over email/username',
            schema: { type: 'string' },
          },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          {
            name: 'pageSize',
            in: 'query',
            schema: { type: 'integer', default: 20, maximum: 100 },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated users, without passwordHash',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/AdminUsersPage' } },
            },
          },
          '400': { description: 'Invalid query parameters' },
          '401': { description: 'Access token required' },
          '403': { description: 'Admin role required' },
        },
      },
    },
    '/api/admin/knowledge': {
      get: {
        tags: ['Admin'],
        summary: 'Vector catalog stats',
        description:
          'Row count and a small unordered sample for each of the three vector indices ' +
          '(pids_index, dtcs_index, diagnoses_index). No embeddings are generated. Requires admin role.',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Count and sample per index',
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/KnowledgeStats' } },
            },
          },
          '401': { description: 'Access token required' },
          '403': { description: 'Admin role required' },
          '503': { description: 'Vector catalog not available' },
        },
      },
    },
    '/api/admin/knowledge/search': {
      post: {
        tags: ['Admin'],
        summary: 'Test semantic search against the vector catalog',
        description:
          'Runs the same embed + VectorStore.query() flow used by the real RAG pipeline, ' +
          'so the operator can preview what a diagnosis would retrieve for a given text. ' +
          'Requires admin role.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/KnowledgeSearchRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Search results for the given text',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/KnowledgeSearchResponse' },
              },
            },
          },
          '400': { description: 'Invalid body (empty text, unknown index, or limit out of range)' },
          '401': { description: 'Access token required' },
          '403': { description: 'Admin role required' },
          '503': { description: 'Vector catalog not available' },
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
          role: { type: 'string', enum: ['user', 'admin'], example: 'user' },
          businessName: { type: 'string', nullable: true },
          taxId: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          createdAt: { type: 'string' },
          isWorkshop: { type: 'boolean' },
          isAdmin: { type: 'boolean' },
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
        required: ['id', 'name', 'vehicleType', 'connectionType', 'vehicleInfo'],
        properties: {
          id: { type: 'string', example: 'audi-a3-idle' },
          name: { type: 'string', example: 'Audi A3 al ralenti' },
          vehicleType: { type: 'string', enum: ['car', 'motorcycle'] },
          connectionType: {
            type: 'string',
            enum: ['wifi', 'usb', 'bluetooth'],
            example: 'wifi',
            description:
              'Tipo de conexión al dispositivo: wifi (TCP/IP), usb (serial), bluetooth (RFCOMM)',
          },
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
      AvailablePid: {
        type: 'object',
        properties: {
          code: { type: 'string', example: '01 0C' },
          name: { type: 'string', example: 'Engine RPM' },
          unit: { type: 'string', example: 'rpm' },
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
      EcuInfo: {
        type: 'object',
        properties: {
          id: { type: 'number', example: 1 },
          vehicleId: { type: 'number', example: 1 },
          name: { type: 'string', example: 'Engine Control Module' },
          requestAddr: { type: 'string', example: '7E0' },
          responseAddr: { type: 'string', example: '7E8' },
          type: { type: 'string', example: 'engine' },
          protocol: { type: 'string', example: 'ISO 15765-4' },
          discoveredAt: { type: 'string', format: 'date-time' },
        },
      },
      AdminUserStats: {
        type: 'object',
        properties: {
          byUserType: {
            type: 'object',
            additionalProperties: { type: 'integer' },
            example: { individual: 8, workshop: 2 },
          },
          byRole: {
            type: 'object',
            additionalProperties: { type: 'integer' },
            example: { user: 9, admin: 1 },
          },
        },
      },
      AdminOverview: {
        type: 'object',
        description:
          '`httpRequestsByPathApprox` is NOT real diagnosis volume: there is no ' +
          'persisted-diagnoses table yet, so it is derived from audit_logs grouped by path ' +
          '(an HTTP-traffic proxy).',
        properties: {
          userStats: { $ref: '#/components/schemas/AdminUserStats' },
          recentErrorCount: {
            type: 'integer',
            description: 'Count of logs with level=error in the last 24h.',
            example: 3,
          },
          httpRequestsByPathApprox: {
            type: 'object',
            additionalProperties: { type: 'integer' },
            description:
              'APPROXIMATION. HTTP requests grouped by path (all-time), not real ' +
              'diagnoses. Source: audit_logs.',
            example: { '/api/diagnosis': 42, '/api/auth/login': 10 },
          },
        },
      },
      AdminLogEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
          message: { type: 'string', example: 'server started' },
          context: { type: 'string', nullable: true, example: '{"port":4000}' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AdminLogsPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminLogEntry' } },
          total: { type: 'integer', example: 128 },
        },
      },
      AdminAuditLogEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          method: { type: 'string', example: 'GET' },
          path: { type: 'string', example: '/api/diagnosis' },
          statusCode: { type: 'integer', example: 200 },
          ip: { type: 'string', nullable: true, example: '127.0.0.1' },
          userAgent: { type: 'string', nullable: true, example: 'Mozilla/5.0' },
          durationMs: { type: 'integer', nullable: true, example: 42 },
          userId: { type: 'integer', nullable: true, example: 7 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AdminAuditLogsPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminAuditLogEntry' } },
          total: { type: 'integer', example: 512 },
        },
      },
      AdminUserEntry: {
        type: 'object',
        description: 'Same shape as UserProfile. Never includes passwordHash.',
        properties: {
          id: { type: 'integer' },
          username: { type: 'string' },
          email: { type: 'string' },
          userType: { type: 'string', enum: ['individual', 'workshop'] },
          role: { type: 'string', enum: ['user', 'admin'] },
          businessName: { type: 'string', nullable: true },
          taxId: { type: 'string', nullable: true },
          address: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
          failedLoginAttempts: { type: 'integer' },
          lockedUntil: { type: 'string', nullable: true },
          isWorkshop: { type: 'boolean' },
          isAdmin: { type: 'boolean' },
        },
      },
      AdminUsersPage: {
        type: 'object',
        properties: {
          items: { type: 'array', items: { $ref: '#/components/schemas/AdminUserEntry' } },
          total: { type: 'integer', example: 10 },
        },
      },
      KnowledgeIndexSummary: {
        type: 'object',
        properties: {
          count: { type: 'integer', example: 340 },
          sample: {
            type: 'array',
            items: { type: 'object', additionalProperties: true },
            description: 'Up to 5 metadata rows, unordered (no relevance ranking).',
          },
        },
      },
      KnowledgeStats: {
        type: 'object',
        properties: {
          pids: { $ref: '#/components/schemas/KnowledgeIndexSummary' },
          dtcs: { $ref: '#/components/schemas/KnowledgeIndexSummary' },
          diagnoses: { $ref: '#/components/schemas/KnowledgeIndexSummary' },
        },
      },
      KnowledgeSearchRequest: {
        type: 'object',
        required: ['text', 'index'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 500, example: 'cylinder 1 misfire' },
          index: { type: 'string', enum: ['pids', 'dtcs', 'diagnoses'], example: 'dtcs' },
          limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
        },
      },
      KnowledgeSearchResponse: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                entry: { type: 'object', additionalProperties: true },
                distance: { type: 'number', example: 0.12 },
              },
            },
          },
        },
      },
      DiagnosisSessionList: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: { $ref: '#/components/schemas/DiagnosisSessionSummary' },
          },
          total: { type: 'integer', example: 42 },
        },
      },
      DiagnosisSessionSummary: {
        type: 'object',
        description:
          'Summary without resultJson. The full snapshot is only in the detail endpoint.',
        properties: {
          id: { type: 'integer', example: 1 },
          vehicleId: { type: 'integer', nullable: true, example: 1 },
          scenarioId: { type: 'string', nullable: true, example: 'audi-a3-tdi' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            nullable: true,
            example: 'high',
          },
          dtcCount: { type: 'integer', nullable: true, example: 3 },
        },
      },
      DiagnosisSessionDetail: {
        type: 'object',
        description: 'Full session including the immutable result snapshot.',
        properties: {
          id: { type: 'integer', example: 1 },
          vehicleId: { type: 'integer', nullable: true, example: 1 },
          scenarioId: { type: 'string', nullable: true, example: 'audi-a3-tdi' },
          startedAt: { type: 'string', format: 'date-time' },
          endedAt: { type: 'string', format: 'date-time', nullable: true },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            nullable: true,
            example: 'high',
          },
          dtcCount: { type: 'integer', nullable: true, example: 3 },
          resultJson: {
            type: 'string',
            nullable: true,
            description: 'Immutable snapshot with vehicle identity, DTCs, and LLM verdict.',
          },
        },
      },
    },
  },
} as const
