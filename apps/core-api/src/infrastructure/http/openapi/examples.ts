import type { ExampleMap } from './registry.js'

/**
 * Cuerpos de ejemplo de las peticiones, indexados con el mismo nombre que su schema.
 *
 * Zod no admite ejemplos, asi que viven aqui y `buildOpenApiDocument` los inyecta en el
 * schema ya generado. Sin esto, el "Try it out" de Swagger UI arranca con un cuerpo de
 * campos vacios y hay que rellenarlo a mano antes de poder probar nada.
 *
 * Los valores son los del escenario Audi de la demo, para que copiarlos tal cual
 * funcione contra el emulador.
 */
export const openApiExamples: ExampleMap = {
  RegisterRequest: {
    username: 'taller-quintana',
    email: 'taller@example.com',
    password: 'Diagnostico2026!',
    userType: 'workshop',
    businessName: 'Talleres Quintana SL',
    taxId: 'B12345678',
    address: 'Poligono Industrial 12, Nave 3',
  },
  LoginRequest: {
    email: 'taller@example.com',
    password: 'Diagnostico2026!',
  },
  RefreshRequest: {
    refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  },
  ForgotPasswordRequest: {
    email: 'taller@example.com',
  },
  ResetPasswordRequest: {
    token: '3f9a1c7e5b2d40118a6e7c9d2f4b8a10',
    newPassword: 'Diagnostico2026!',
  },
  UpdateProfileRequest: {
    username: 'taller-quintana',
    businessName: 'Talleres Quintana SL',
    taxId: 'B12345678',
    address: 'Poligono Industrial 12, Nave 3',
  },
  ChangePasswordRequest: {
    currentPassword: 'Diagnostico2026!',
    newPassword: 'Diagnostico2027!',
  },
  KnowledgeSearchRequest: {
    text: 'fallo de encendido en un cilindro',
    index: 'dtcs',
    limit: 5,
  },
  DiagnosisRequest: {
    scenarioId: 'audi-a3-tdi',
  },
  McpToolRequest: {
    scenarioId: 'audi-a3-tdi',
    args: { pid: '01 0C' },
  },
  CognitiveDiagnosisRequest: {
    scenarioId: 'audi-a3-tdi',
    query: 'El coche tironea al acelerar en frio, que puede ser?',
  },
  VehicleIdentityRequest: {
    vin: 'WAUZZZ8V5JA123456',
    make: 'Audi',
    model: 'A3',
    year: 2018,
    engineType: '2.0 TDI',
  },
}
