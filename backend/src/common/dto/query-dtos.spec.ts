import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ListAppointmentsQueryDto, AvailabilityQueryDto } from '../../modules/appointments/dto/create-appointment.dto';
import { ListCustomersQueryDto } from '../../modules/customers/dto/create-customer.dto';
import { CreateBookingDto, PublicSlotsQueryDto } from '../../modules/booking/dto/booking.dto';

// Same options as the global pipe in main.ts.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const run = (metatype: any, value: any) =>
  pipe.transform(value, { type: 'query', metatype });

const UUID = '3f1c2a5e-8b7d-4c3e-9a1f-2b6d7e8f9a0b';

describe('query DTO validation', () => {
  it('caps the page size of list endpoints', async () => {
    await expect(run(ListCustomersQueryDto, { limit: '1000000' })).rejects.toThrow(BadRequestException);
    await expect(run(ListAppointmentsQueryDto, { limit: '500' })).rejects.toThrow(BadRequestException);
    await expect(run(ListCustomersQueryDto, { limit: '30' })).resolves.toMatchObject({ limit: 30 });
  });

  it('rejects malformed ids and statuses instead of reaching Prisma (500)', async () => {
    await expect(run(ListAppointmentsQueryDto, { cursor: 'nope' })).rejects.toThrow(BadRequestException);
    await expect(run(ListAppointmentsQueryDto, { status: 'bogus' })).rejects.toThrow(BadRequestException);
    await expect(run(PublicSlotsQueryDto, { employeeId: 'x', serviceId: UUID, date: '2026-10-17' })).rejects.toThrow(BadRequestException);
  });

  it('requires civil dates (YYYY-MM-DD) where wall-clock math is done', async () => {
    await expect(run(AvailabilityQueryDto, { employeeId: UUID, date: '2026-10-17T10:00:00Z' })).rejects.toThrow(BadRequestException);
    await expect(run(AvailabilityQueryDto, { employeeId: UUID, date: '2026-10-17', duration: '60' })).resolves.toMatchObject({ duration: 60 });
  });

  it('rejects ISO timestamps and bad slots in public bookings', async () => {
    const base = {
      serviceId: UUID, employeeId: UUID, slot: '10:00',
      firstName: 'A', lastName: 'B', phone: '600000000',
    };
    const asBody = (v: any) => pipe.transform(v, { type: 'body', metatype: CreateBookingDto });
    await expect(asBody({ ...base, date: '2026-03-15T10:00:00Z' })).rejects.toThrow(BadRequestException);
    await expect(asBody({ ...base, date: '2026-03-15', slot: '10' })).rejects.toThrow(BadRequestException);
    await expect(asBody({ ...base, date: '2026-03-15' })).resolves.toBeDefined();
  });
});
