import { describe, it, expect, vi } from 'vitest'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import {
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
  DiagnosisSessionNotFoundError,
} from '@/infrastructure/services/errors.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import { VehicleIdentity } from '@/domain/entities/vehicleIdentity.js'
import { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { KnowledgeStackPort } from '@/application/ports/KnowledgeStackPort.js'
import type { PidVectorRepository } from '@/application/ports/PidVectorRepository.js'
import type { DtcVectorRepository } from '@/application/ports/DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { EcuVectorRepository } from '@/application/ports/EcuVectorRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import {
  cognitiveText,
  cognitiveToolCalls,
  createMockLogger,
  createMockObdRepo,
  createMockObdRepos,
  createMockVehicleRepo,
  mockLlmClient,
  mockScenarios,
} from './diagnosisServiceTestFactories.js'

describe('DiagnosisService — diagnostico cognitivo y persistencia', () => {
  describe('cognitiveDiagnosis', () => {
    it('should throw CognitiveDiagnosisUnavailableError without an llmClient', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.cognitiveDiagnosis({ scenarioId: 'audi-a3-idle' })).rejects.toThrow(
        CognitiveDiagnosisUnavailableError,
      )
    })

    it('should run the cognitive use case and return the parsed output', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla el motor al ralentí?',
      })

      expect(result.diagnosis).toBe('El motor tiembla en ralentí por fallo de encendido.')
      expect(result.severity).toBe('high')
      expect(result.confidence).toBe(0.9)
      expect(result.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
      expect(result.toolCalls).toEqual(cognitiveToolCalls)
      expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
      const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(input.tools).toHaveLength(7)
      expect(input.userMessage).toContain('Audi A3')
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      await expect(service.cognitiveDiagnosis({ scenarioId: 'no-existe' })).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
      expect(llmClient.sendMessage).not.toHaveBeenCalled()
    })

    it('should pass conversationHistory to the use case', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Y eso por qué?',
        conversationHistory: [
          { __type: 'user_message', content: '¿Por qué tiembla?' },
          { __type: 'raw_response', data: { text: 'Fallos de cilindro 1' } },
        ],
      })

      const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(input.conversationHistory).toEqual([
        { __type: 'user_message', content: '¿Por qué tiembla?' },
        { __type: 'raw_response', data: { text: 'Fallos de cilindro 1' } },
      ])
    })

    it('should propagate knowledgeStack to the cognitive use case', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const diagnosisIndex: DiagnosisVectorRepository = {
        search: vi.fn().mockResolvedValue([]),
        index: vi.fn().mockResolvedValue(undefined),
      }
      const pidsIndex = { index: vi.fn(), search: vi.fn() } as unknown as PidVectorRepository
      const dtcsIndex = { index: vi.fn(), search: vi.fn() } as unknown as DtcVectorRepository
      const ecusIndex = { index: vi.fn(), search: vi.fn() } as unknown as EcuVectorRepository
      const knowledgeStack: KnowledgeStackPort = { pidsIndex, dtcsIndex, diagnosisIndex, ecusIndex }
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        knowledgeStack,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla el motor al ralentí?',
      })

      expect(diagnosisIndex.index).toHaveBeenCalledTimes(1)
    })
  })

  describe('hasCognitiveDiagnosis', () => {
    it('should return true when the service receives an llmClient', () => {
      const llmClient = mockLlmClient()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
      })

      expect(service.hasCognitiveDiagnosis).toBe(true)
    })

    it('should return false when llmClient is undefined', () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      expect(service.hasCognitiveDiagnosis).toBe(false)
    })
  })

  describe('cognitive diagnosis — persistence wiring', () => {
    /** Vin de prueba usado en el mock de getVehicleInfo. */
    const TEST_VIN = new Vin('WAUZZZ8V5JA123456')

    /** Helper: configura servicio con llmClient exitoso + vehicleRepo. */
    function createService(vehicleRepo?: VehicleRepository, llmOverrides?: Partial<LlmClientPort>) {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
        ...llmOverrides,
      })
      return new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })
    }

    it('upserts vehicle with correct profile converted from VehicleInfo', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(vehicleRepo.upsertVehicle).toHaveBeenCalledTimes(1)
      const profileArg = (vehicleRepo.upsertVehicle as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as VehicleProfile
      expect(profileArg).toBeInstanceOf(VehicleProfile)
      expect(profileArg.id).toBe(0)
      expect(profileArg.make).toBe('Audi')
      expect(profileArg.model).toBe('A3')
      expect(profileArg.year).toBe(2018)
      expect(profileArg.engineType).toBe('unknown')
      expect(profileArg.vin).toBeInstanceOf(Vin)
      expect(profileArg.vin.value).toBe('WAUZZZ8V5JA123456')
    })

    it('does not call upsert when vehicleRepo is absent', async () => {
      // No vehicleRepo passed — diagnosis debe completarse sin error
      const result = await createService(undefined).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(result.diagnosis).toContain('El motor tiembla')
      expect(result.severity).toBe('high')
    })

    it('degrades gracefully when upsertVehicle fails', async () => {
      const logger = createMockLogger()
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockRejectedValue(new Error('DB connection lost')),
      })
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      // El diagnóstico debe completarse sin propagar el error del upsert
      expect(result.diagnosis).toContain('El motor tiembla')
      expect(vehicleRepo.upsertVehicle).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to upsert vehicle in diagnosis session',
        expect.objectContaining({ err: expect.any(Error) }),
      )
    })

    it('creates session after upsert success', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(vehicleRepo.createSession).toHaveBeenCalledTimes(1)
      const sessionArg = (vehicleRepo.createSession as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as DiagnosisSession
      expect(sessionArg).toBeInstanceOf(DiagnosisSession)
      expect(sessionArg.vehicleId).toBe(42)
      expect(sessionArg.scenarioId).toBe('audi-a3-idle')
      expect(sessionArg.startedAt).toBeDefined()
    })

    it('persists the first assistant turn in the snapshot conversation', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
        endSession: endSessionSpy,
      })

      await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(endSessionSpy).toHaveBeenCalledTimes(1)
      const snapshot = endSessionSpy.mock.calls[0][1] as {
        resultJson: string
        severity: string
        dtcCount: number
      }
      expect(snapshot).toBeDefined()
      const parsed = JSON.parse(snapshot.resultJson) as {
        conversation: Array<{ role: string; text: string; timestamp: string }>
      }
      expect(parsed.conversation).toEqual([
        {
          role: 'assistant',
          text: 'El motor tiembla en ralentí por fallo de encendido.',
          timestamp: expect.any(String),
        },
      ])
    })

    it('returns the created sessionId in the cognitive result', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      const result = await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(result.sessionId).toBe(10)
    })

    it('reuses the existing session and appends the follow-up turns without creating a new session', async () => {
      const existingSession = new DiagnosisSession({
        id: 10,
        vehicleId: 42,
        userId: 7,
        scenarioId: 'audi-a3-idle',
        startedAt: '2026-08-12T10:00:00.000Z',
        endedAt: '2026-08-12T10:01:00.000Z',
        resultJson: JSON.stringify({
          vehicle: { vin: 'WAUZZZ8V5JA123456', make: 'Audi', model: 'A3', year: 2018 },
          diagnosis: { severity: 'high', confidence: 0.9, narrative: 'primero' },
          conversation: [{ role: 'assistant', text: 'primero', timestamp: 't1' }],
          timestamp: 't1',
        }),
      })
      const updateSessionResultSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        findSessionById: vi.fn().mockResolvedValue(existingSession),
        updateSessionResult: updateSessionResultSpy,
      })

      const result = await createService(vehicleRepo).cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Y en frío?',
        userId: 7,
        sessionId: 10,
      })

      expect(result.sessionId).toBe(10)
      expect(vehicleRepo.upsertVehicle).not.toHaveBeenCalled()
      expect(vehicleRepo.createSession).not.toHaveBeenCalled()
      expect(updateSessionResultSpy).toHaveBeenCalledTimes(1)
      const [sid, snapshot] = updateSessionResultSpy.mock.calls[0] as [
        number,
        { resultJson: string; severity: string; dtcCount: number },
      ]
      expect(sid).toBe(10)
      const parsed = JSON.parse(snapshot.resultJson) as {
        conversation: Array<{ role: string; text: string; timestamp: string }>
      }
      expect(parsed.conversation).toHaveLength(3)
      expect(parsed.conversation[0]).toEqual({
        role: 'assistant',
        text: 'primero',
        timestamp: 't1',
      })
      expect(parsed.conversation[1]).toMatchObject({ role: 'user', text: '¿Y en frío?' })
      expect(parsed.conversation[2]).toMatchObject({
        role: 'assistant',
        text: 'El motor tiembla en ralentí por fallo de encendido.',
      })
    })

    it('throws DiagnosisSessionNotFoundError for another user sessionId without mutating', async () => {
      const sendSpy = vi
        .fn()
        .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls })
      const vehicleRepo = createMockVehicleRepo({
        findSessionById: vi.fn().mockResolvedValue(null),
      })

      await expect(
        createService(vehicleRepo, { sendMessage: sendSpy }).cognitiveDiagnosis({
          scenarioId: 'audi-a3-idle',
          userQuery: 'x',
          userId: 7,
          sessionId: 999,
        }),
      ).rejects.toThrow(DiagnosisSessionNotFoundError)

      expect(sendSpy).not.toHaveBeenCalled()
      expect(vehicleRepo.createSession).not.toHaveBeenCalled()
      expect(vehicleRepo.updateSessionResult).not.toHaveBeenCalled()
      expect(vehicleRepo.endSession).not.toHaveBeenCalled()
    })

    it('calls endSession in finally even on cognitiveDiagnosis error', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
        endSession: endSessionSpy,
      })
      const logger = createMockLogger()

      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockRejectedValue(new Error('LLM API failure')),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      await expect(
        service.cognitiveDiagnosis({
          scenarioId: 'audi-a3-idle',
          userQuery: '¿Por qué tiembla?',
        }),
      ).rejects.toThrow('LLM API failure')

      expect(endSessionSpy).toHaveBeenCalledTimes(1)
      expect(endSessionSpy).toHaveBeenCalledWith(10, undefined)
    })

    it('does not call endSession if createSession failed', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockResolvedValue(undefined)
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockRejectedValue(new Error('DB write failed')),
        endSession: endSessionSpy,
      })
      const logger = createMockLogger()

      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      const result = await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla?',
      })

      expect(result.diagnosis).toContain('El motor tiembla')
      expect(endSessionSpy).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to create diagnosis session',
        expect.objectContaining({ err: expect.any(Error) }),
      )
    })

    it('enriches sessionContext with normalized manufacturer and model', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      // LLM mock that invokes read_pid with mode 22 to trigger autoRegisterPid
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockImplementation(async (_input, handler) => {
          await handler('read_pid', { mode: '22', pid: '0300' })
          return {
            text: cognitiveText,
            toolCalls: [{ tool: 'read_pid', args: { mode: '22', pid: '0300' }, result: '750' }],
          }
        }),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: 'test',
      })

      // Flush fire-and-forget microtasks from autoRegisterPid
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that findPidDefinition was called with manufacturer/model from sessionContext
      expect(vehicleRepo.findPidDefinition).toHaveBeenCalledWith('22', '0300', 'Audi', 'A3')
      expect(vehicleRepo.insertPidDefinition).toHaveBeenCalledTimes(1)
      const inserted = (vehicleRepo.insertPidDefinition as ReturnType<typeof vi.fn>).mock
        .calls[0][0]
      expect(inserted.manufacturer).toBe('Audi')
      expect(inserted.model).toBe('A3')
    })

    it('normalizes manufacturer in sessionContext (e.g., "audi ag" → "Audi")', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      // Override the obd repo for audi-a3-idle to return "Audi AG" as make
      const repos = createMockObdRepos()
      vi.mocked(
        repos.get('audi-a3-idle')!.getVehicleInfo as ReturnType<typeof vi.fn>,
      ).mockResolvedValue({
        make: 'Audi AG',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })

      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockImplementation(async (_input, handler) => {
          await handler('read_pid', { mode: '22', pid: '0300' })
          return {
            text: cognitiveText,
            toolCalls: [{ tool: 'read_pid', args: { mode: '22', pid: '0300' }, result: '750' }],
          }
        }),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: 'test',
      })

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that the normalized manufacturer "Audi" was passed (not "Audi AG")
      expect(vehicleRepo.findPidDefinition).toHaveBeenCalledWith('22', '0300', 'Audi', 'A3')
    })

    it('triggers persistPidReading via MCP tool calls when sessionContext is active', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
      })

      // LLM mock that actually invokes the tool call handler
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockImplementation(async (_input, handler) => {
          // Simulate the LLM making tool calls — invoke the handler for each
          for (const tc of cognitiveToolCalls) {
            await handler(tc.tool, tc.args)
          }
          return { text: cognitiveText, toolCalls: cognitiveToolCalls }
        }),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger: createMockLogger(),
        vehicleRepo,
      })

      await service.cognitiveDiagnosis({
        scenarioId: 'audi-a3-idle',
        userQuery: 'test',
      })

      // Flush fire-and-forget microtasks from persistPidReading
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify that the MCP's read_pid tool triggered persistence via sessionContext
      expect(vehicleRepo.insertPidReading).toHaveBeenCalled()
    })

    it('does not mask original exception when endSession fails in finally', async () => {
      const upsertedProfile = new VehicleProfile({
        id: 42,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: 'unknown',
        vin: TEST_VIN,
      })
      const endSessionSpy = vi.fn().mockRejectedValue(new Error('endSession failed'))
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(upsertedProfile),
        createSession: vi.fn().mockResolvedValue(
          new DiagnosisSession({
            id: 10,
            vehicleId: 42,
            scenarioId: 'audi-a3-idle',
            startedAt: new Date().toISOString(),
          }),
        ),
        endSession: endSessionSpy,
      })
      const logger = createMockLogger()

      const originalError = new Error('Original diagnosis error')
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockRejectedValue(originalError),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        llmClient,
        logger,
        vehicleRepo,
      })

      // La excepción original debe propagarse, no la de endSession
      await expect(
        service.cognitiveDiagnosis({
          scenarioId: 'audi-a3-idle',
          userQuery: '¿Por qué tiembla?',
        }),
      ).rejects.toThrow('Original diagnosis error')

      expect(endSessionSpy).toHaveBeenCalledTimes(1)
      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to end diagnosis session with snapshot',
        expect.any(Error),
      )
    })
  })

  describe('identificacion del vehiculo en conexion directa', () => {
    /**
     * El daño que motivó la cascada.
     *
     * Con un coche real no hay descriptor de escenario: la marca sale del VIN. Un
     * WMI que no estuviera en la tabla de código dejaba `make: 'unknown'`, y como
     * el catálogo RAG se archiva y se busca por fabricante/modelo, todo lo que el
     * agente aprendiera de ese coche quedaba bajo `unknown/unknown` y no se
     * recuperaba nunca.
     */
    const PEUGEOT_VIN = 'VR3XXXXXXXX123456'

    function directService(vehicleRepo: VehicleRepository) {
      const obdRepo = createMockObdRepo()
      obdRepo.getVehicleInfo = vi.fn(async () => ({
        // Lo que devuelve el adaptador ELM327 de verdad: solo sabe leer el VIN.
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin(PEUGEOT_VIN),
        vinStatus: 'read' as const,
      }))
      return new DiagnosisService({
        scenarios: [],
        obdRepo,
        llmClient: mockLlmClient({
          sendMessage: vi
            .fn()
            .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
        }),
        logger: createMockLogger(),
        vehicleRepo,
      })
    }

    it('archiva el vehiculo con la marca del catalogo, no con unknown', async () => {
      const vehicleRepo = createMockVehicleRepo({
        findVehicleIdentityByWmi: vi.fn().mockResolvedValue(
          new VehicleIdentity({
            id: 1,
            wmi: 'VR3',
            manufacturer: 'Peugeot',
            confidence: 0.3,
            source: 'web',
          }),
        ),
        upsertVehicle: vi.fn().mockResolvedValue(
          new VehicleProfile({
            id: 5,
            make: 'Peugeot',
            model: 'unknown',
            year: 2029,
            engineType: 'unknown',
            vin: new Vin(PEUGEOT_VIN),
          }),
        ),
      })

      await directService(vehicleRepo).cognitiveDiagnosis({ userQuery: '¿Qué le pasa?' })

      const profile = (vehicleRepo.upsertVehicle as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as VehicleProfile
      expect(profile.make).toBe('Peugeot')
      expect(profile.vin.value).toBe(PEUGEOT_VIN)
    })

    it('consulta el catalogo por el WMI del coche conectado', async () => {
      const vehicleRepo = createMockVehicleRepo({
        upsertVehicle: vi.fn().mockResolvedValue(
          new VehicleProfile({
            id: 5,
            make: 'unknown',
            model: 'unknown',
            year: 2029,
            engineType: 'unknown',
            vin: new Vin(PEUGEOT_VIN),
          }),
        ),
      })

      await directService(vehicleRepo).cognitiveDiagnosis({ userQuery: '¿Qué le pasa?' })

      expect(vehicleRepo.findVehicleIdentityByWmi).toHaveBeenCalledWith('VR3')
    })
  })
})
