import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../common/prisma/prisma.service';

const TENANT_ID = 'tenant-1';
const EMPLOYEE = { id: 'emp-1', tenantId: TENANT_ID, firstName: 'Carlos', lastName: 'García' };

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  employee: { findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
  service: { count: jest.fn(), findMany: jest.fn() },
  employeeService: {
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('EmployeesService', () => {
  let service: EmployeesService;

  beforeEach(async () => {
    jest.clearAllMocks();
    // Interactive transactions run the callback against the same mock client.
    mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(EmployeesService);
  });

  describe('create', () => {
    it('links the new employee to every active service', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maxEmployees: 5 });
      mockPrisma.employee.count.mockResolvedValue(1);
      mockPrisma.employee.create.mockResolvedValue(EMPLOYEE);
      mockPrisma.service.findMany.mockResolvedValue([{ id: 'svc-1' }, { id: 'svc-2' }]);

      await service.create(TENANT_ID, { firstName: 'Carlos', lastName: 'García' } as any);

      expect(mockPrisma.employeeService.createMany).toHaveBeenCalledWith({
        data: [
          { tenantId: TENANT_ID, employeeId: 'emp-1', serviceId: 'svc-1' },
          { tenantId: TENANT_ID, employeeId: 'emp-1', serviceId: 'svc-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('rejects when the plan employee limit is reached', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ maxEmployees: 1 });
      mockPrisma.employee.count.mockResolvedValue(1);

      await expect(
        service.create(TENANT_ID, { firstName: 'A', lastName: 'B' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.employee.create).not.toHaveBeenCalled();
    });
  });

  describe('setServices', () => {
    it('replaces the employee services with the given (deduplicated) set', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
      mockPrisma.service.count.mockResolvedValue(2);
      mockPrisma.employeeService.findMany.mockResolvedValue([
        { serviceId: 'svc-1' },
        { serviceId: 'svc-2' },
      ]);

      const result = await service.setServices(TENANT_ID, 'emp-1', ['svc-1', 'svc-2', 'svc-1']);

      expect(mockPrisma.employeeService.deleteMany).toHaveBeenCalledWith({
        where: { employeeId: 'emp-1', tenantId: TENANT_ID },
      });
      expect(mockPrisma.employeeService.createMany).toHaveBeenCalledWith({
        data: [
          { tenantId: TENANT_ID, employeeId: 'emp-1', serviceId: 'svc-1' },
          { tenantId: TENANT_ID, employeeId: 'emp-1', serviceId: 'svc-2' },
        ],
      });
      expect(result).toHaveLength(2);
    });

    it('rejects services that do not belong to the tenant', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
      mockPrisma.service.count.mockResolvedValue(1);

      await expect(
        service.setServices(TENANT_ID, 'emp-1', ['svc-1', 'svc-other-tenant']),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.employeeService.deleteMany).not.toHaveBeenCalled();
    });

    it('allows clearing all services', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(EMPLOYEE);
      mockPrisma.employeeService.findMany.mockResolvedValue([]);

      await service.setServices(TENANT_ID, 'emp-1', []);

      expect(mockPrisma.employeeService.deleteMany).toHaveBeenCalled();
      expect(mockPrisma.employeeService.createMany).not.toHaveBeenCalled();
    });

    it('404s for an unknown employee', async () => {
      mockPrisma.employee.findFirst.mockResolvedValue(null);

      await expect(service.setServices(TENANT_ID, 'nope', [])).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
