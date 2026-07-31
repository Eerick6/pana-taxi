import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Stand } from './entities/stand.entity';
import { StandAssignment } from './entities/stand-assignment.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { CooperativeOwner, OwnerApprovalStatus } from '../cooperatives/entities/cooperative-owner.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateStandDto } from './dto/create-stand.dto';
import { UpdateStandDto } from './dto/update-stand.dto';
import { CheckInDto } from './dto/check-in-stand.dto';

@Injectable()
export class StandsService {
  constructor(
    @InjectRepository(Stand)
    private standsRepo: Repository<Stand>,
    @InjectRepository(StandAssignment)
    private assignmentsRepo: Repository<StandAssignment>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(CooperativeMember)
    private membersRepo: Repository<CooperativeMember>,
    @InjectRepository(CooperativeOwner)
    private coopOwnersRepo: Repository<CooperativeOwner>,
  ) {}

  // Resolves which cooperative the user belongs to (coop staff roles)
  private async getCoopIdForMember(userId: string): Promise<string> {
    const member = await this.membersRepo.findOne({
      where: { user: { id: userId } },
      relations: ['cooperative'],
    });
    if (!member) throw new ForbiddenException('No perteneces a ninguna cooperativa');
    return member.cooperative.id;
  }

  // Returns the scoped cooperative_id for any user:
  // - Platform/Owner: must supply it in dto (or query param)
  // - Coop staff: inferred from their membership
  // - Driver: inferred from their active vehicle's cooperative
  private async resolveCoopId(user: User, explicitCoopId?: string): Promise<string> {
    const platformRoles = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.MONITORING, UserRole.SUPPORT];
    if (platformRoles.includes(user.role)) {
      if (!explicitCoopId) throw new BadRequestException('cooperative_id requerido para roles de plataforma');
      return explicitCoopId;
    }
    if ([UserRole.COOPERATIVE_ADMIN, UserRole.COOPERATIVE_OPERATOR, UserRole.COOPERATIVE_SUPERVISOR].includes(user.role)) {
      return this.getCoopIdForMember(user.id);
    }
    if (user.role === UserRole.DRIVER) {
      return this.getDriverCoopId(user.id);
    }
    throw new ForbiddenException('Rol sin acceso a paradas');
  }

  // For drivers: cooperative comes from their active vehicle or owner membership
  private async getDriverCoopId(userId: string): Promise<string> {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado');

    if (driver.active_vehicle?.cooperative?.id) return driver.active_vehicle.cooperative.id;

    // OWNER_DRIVER: check cooperative_owners junction
    const ownership = await this.coopOwnersRepo.findOne({
      where: { owner: { id: driver.id }, approval_status: OwnerApprovalStatus.APPROVED },
      relations: ['cooperative'],
    });
    if (ownership) return ownership.cooperative.id;

    throw new ForbiddenException('No estás asociado a ninguna cooperativa activa');
  }

  async globalSummary() {
    const stands = await this.standsRepo.find({ relations: ['cooperative'] });
    if (stands.length === 0) return [];

    const ids = stands.map(s => s.id);
    const counts = await this.assignmentsRepo
      .createQueryBuilder('a')
      .select('a.stand_id', 'stand_id')
      .addSelect('COUNT(a.id)', 'count')
      .where('a.stand_id IN (:...ids)', { ids })
      .andWhere('a.checked_out_at IS NULL')
      .groupBy('a.stand_id')
      .getRawMany<{ stand_id: string; count: string }>();

    const countMap = new Map(counts.map(c => [c.stand_id, parseInt(c.count, 10)]));

    // Agrupa por cooperativa
    const byCoopMap = new Map<string, { coop_id: string; coop_name: string; stands: number; drivers_at_stands: number }>();
    for (const s of stands) {
      const coopId = s.cooperative_id;
      const existing = byCoopMap.get(coopId) ?? { coop_id: coopId, coop_name: s.cooperative?.name ?? coopId, stands: 0, drivers_at_stands: 0 };
      existing.stands += 1;
      existing.drivers_at_stands += countMap.get(s.id) ?? 0;
      byCoopMap.set(coopId, existing);
    }

    return Array.from(byCoopMap.values()).sort((a, b) => b.drivers_at_stands - a.drivers_at_stands);
  }

  async findAll(user: User, explicitCoopId?: string) {
    const coopId = await this.resolveCoopId(user, explicitCoopId);

    const stands = await this.standsRepo.find({
      where: { cooperative_id: coopId },
      relations: ['cooperative'],
      order: { name: 'ASC' },
    });

    if (stands.length === 0) return stands;

    const ids = stands.map(s => s.id);
    const counts = await this.assignmentsRepo
      .createQueryBuilder('a')
      .select('a.stand_id', 'stand_id')
      .addSelect('COUNT(a.id)', 'count')
      .where('a.stand_id IN (:...ids)', { ids })
      .andWhere('a.checked_out_at IS NULL')
      .groupBy('a.stand_id')
      .getRawMany<{ stand_id: string; count: string }>();

    const countMap = new Map(counts.map(c => [c.stand_id, parseInt(c.count, 10)]));
    return stands.map(s => ({ ...s, active_drivers: countMap.get(s.id) ?? 0 }));
  }

  async findOne(id: string, user?: User) {
    const stand = await this.standsRepo.findOne({
      where: { id },
      relations: ['cooperative'],
    });
    if (!stand) throw new NotFoundException('Parada no encontrada');

    // Scope check: coop staff/drivers can only see their own cooperative's stands
    if (user) {
      const platformRoles = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.MONITORING, UserRole.SUPPORT];
      if (!platformRoles.includes(user.role)) {
        const userCoopId = await this.resolveCoopId(user);
        if (stand.cooperative_id !== userCoopId) throw new ForbiddenException('Esta parada no pertenece a tu cooperativa');
      }
    }

    return stand;
  }

  async create(user: User, dto: CreateStandDto) {
    const cooperative_id = await this.resolveCoopId(user, dto.cooperative_id);

    const stand = this.standsRepo.create({
      name: dto.name,
      address: dto.address ?? null,
      lat: dto.lat,
      lng: dto.lng,
      cooperative_id,
      capacity: dto.capacity ?? 10,
    });
    return this.standsRepo.save(stand);
  }

  async update(id: string, user: User, dto: UpdateStandDto) {
    await this.findOne(id, user);
    await this.standsRepo.update(id, dto as any);
    return this.findOne(id);
  }

  async remove(id: string, user: User) {
    const stand = await this.findOne(id, user);
    await this.standsRepo.remove(stand);
    return { message: 'Parada eliminada' };
  }

  async checkIn(userId: string, dto: CheckInDto) {
    const driver = await this.driversRepo.findOne({
      where: { user: { id: userId } },
      relations: ['active_vehicle', 'active_vehicle.cooperative'],
    });
    if (!driver) throw new NotFoundException('Conductor no encontrado');

    const stand = await this.standsRepo.findOne({ where: { id: dto.stand_id, is_active: true } });
    if (!stand) throw new NotFoundException('Parada no encontrada o inactiva');

    // Validate driver belongs to the same cooperative as the stand
    const driverCoopId = await this.getDriverCoopId(userId);
    if (driverCoopId !== stand.cooperative_id) {
      throw new ForbiddenException('Esta parada no pertenece a tu cooperativa');
    }

    const existing = await this.assignmentsRepo.findOne({
      where: { driver_id: driver.id, checked_out_at: IsNull() },
      relations: ['stand'],
    });
    if (existing) {
      throw new ConflictException(`Ya estás en la parada "${existing.stand.name}". Sal antes de entrar a otra.`);
    }

    const currentCount = await this.assignmentsRepo.count({
      where: { stand_id: dto.stand_id, checked_out_at: IsNull() },
    });
    if (currentCount >= stand.capacity) {
      throw new BadRequestException(`La parada "${stand.name}" está llena (${stand.capacity} taxis)`);
    }

    const assignment = this.assignmentsRepo.create({
      stand_id: dto.stand_id,
      driver_id: driver.id,
      vehicle_id: dto.vehicle_id ?? driver.active_vehicle?.id ?? null,
    });
    return this.assignmentsRepo.save(assignment);
  }

  async checkOut(userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Conductor no encontrado');

    const assignment = await this.assignmentsRepo.findOne({
      where: { driver_id: driver.id, checked_out_at: IsNull() },
      relations: ['stand'],
    });
    if (!assignment) throw new NotFoundException('No estás en ninguna parada');

    await this.assignmentsRepo.update(assignment.id, { checked_out_at: new Date() });
    return { message: `Saliste de la parada "${assignment.stand.name}"` };
  }

  async getQueue(standId: string, user: User) {
    await this.findOne(standId, user);
    return this.assignmentsRepo.find({
      where: { stand_id: standId, checked_out_at: IsNull() },
      relations: ['driver', 'driver.user', 'vehicle'],
      order: { checked_in_at: 'ASC' },
    });
  }

  async getMyStand(userId: string) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Conductor no encontrado');

    return this.assignmentsRepo.findOne({
      where: { driver_id: driver.id, checked_out_at: IsNull() },
      relations: ['stand'],
    });
  }

  // Called automatically when driver starts a trip — remove from queue
  async autoCheckOut(driverId: string) {
    const assignment = await this.assignmentsRepo.findOne({
      where: { driver_id: driverId, checked_out_at: IsNull() },
    });
    if (assignment) {
      await this.assignmentsRepo.update(assignment.id, { checked_out_at: new Date() });
    }
  }
}
