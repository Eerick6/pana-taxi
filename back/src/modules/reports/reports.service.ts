import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ReportFiltersDto } from './dto/report-filters.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    @InjectRepository(DriverWallet)
    private walletsRepo: Repository<DriverWallet>,
    @InjectRepository(CooperativeMember)
    private membersRepo: Repository<CooperativeMember>,
  ) {}

  // Resuelve cooperative_id según el rol del usuario
  private async resolveCoopId(user: User, explicit?: string): Promise<string | null> {
    const platformRoles = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE, UserRole.SUPPORT];
    if (platformRoles.includes(user.role)) return explicit ?? null;

    const member = await this.membersRepo.findOne({
      where: { user: { id: user.id } },
      relations: ['cooperative'],
    });
    if (!member) throw new ForbiddenException('No perteneces a ninguna cooperativa');
    return member.cooperative.id;
  }

  // ── Resumen general ────────────────────────────────────────────────────────

  async getSummary(user: User, filters: ReportFiltersDto) {
    const coopId = await this.resolveCoopId(user, filters.cooperative_id);
    const { from, to } = this.parseDateRange(filters);

    const qb = this.tripsRepo
      .createQueryBuilder('t')
      .where('t.status = :status', { status: TripStatus.COMPLETED });

    if (coopId) qb.andWhere('t.cooperative_id = :coopId', { coopId });
    if (from) qb.andWhere('t.completed_at >= :from', { from });
    if (to) qb.andWhere('t.completed_at <= :to', { to });

    const [trips, total] = await qb.getManyAndCount();

    const totalRevenue = trips.reduce((s, t) => s + parseFloat(t.fare_amount as any || '0'), 0);
    const totalCommissions = trips.reduce((s, t) => s + parseFloat(t.commission_amount as any || '0'), 0);
    const avgFare = total > 0 ? totalRevenue / total : 0;

    return {
      period: { from: from?.toISOString(), to: to?.toISOString() },
      total_trips: total,
      total_revenue: +totalRevenue.toFixed(2),
      total_commissions: +totalCommissions.toFixed(2),
      avg_fare: +avgFare.toFixed(2),
      cooperative_id: coopId,
    };
  }

  // ── Viajes paginados ───────────────────────────────────────────────────────

  async getTrips(user: User, filters: ReportFiltersDto) {
    const coopId = await this.resolveCoopId(user, filters.cooperative_id);
    const { from, to } = this.parseDateRange(filters);
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;

    const qb = this.tripsRepo
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.driver', 'd')
      .leftJoinAndSelect('d.user', 'du')
      .leftJoinAndSelect('t.cooperative', 'coop')
      .where('t.status = :status', { status: TripStatus.COMPLETED })
      .orderBy('t.completed_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (coopId) qb.andWhere('t.cooperative_id = :coopId', { coopId });
    if (filters.driver_id) qb.andWhere('d.id = :driverId', { driverId: filters.driver_id });
    if (from) qb.andWhere('t.completed_at >= :from', { from });
    if (to) qb.andWhere('t.completed_at <= :to', { to });

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  // ── Por conductor ──────────────────────────────────────────────────────────

  async getDriverEarnings(user: User, filters: ReportFiltersDto) {
    const coopId = await this.resolveCoopId(user, filters.cooperative_id);
    const { from, to } = this.parseDateRange(filters);

    const qb = this.tripsRepo
      .createQueryBuilder('t')
      .select('d.id', 'driver_id')
      .addSelect('d.full_name', 'driver_name')
      .addSelect('COUNT(t.id)', 'total_trips')
      .addSelect('SUM(CAST(t.fare_amount AS DECIMAL(10,2)))', 'total_fare')
      .addSelect('SUM(CAST(t.commission_amount AS DECIMAL(10,2)))', 'total_commission')
      .addSelect('SUM(CAST(t.fare_amount AS DECIMAL(10,2))) - SUM(CAST(t.commission_amount AS DECIMAL(10,2)))', 'net_earnings')
      .innerJoin('t.driver', 'd')
      .where('t.status = :status', { status: TripStatus.COMPLETED })
      .groupBy('d.id')
      .addGroupBy('d.full_name')
      .orderBy('total_fare', 'DESC');

    if (coopId) qb.andWhere('t.cooperative_id = :coopId', { coopId });
    if (filters.driver_id) qb.andWhere('d.id = :driverId', { driverId: filters.driver_id });
    if (from) qb.andWhere('t.completed_at >= :from', { from });
    if (to) qb.andWhere('t.completed_at <= :to', { to });

    return qb.getRawMany();
  }

  // ── Por cooperativa (solo plataforma) ─────────────────────────────────────

  async getCooperativeBreakdown(user: User, filters: ReportFiltersDto) {
    const platformRoles = [UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE];
    if (!platformRoles.includes(user.role)) throw new ForbiddenException('Solo para plataforma');

    const { from, to } = this.parseDateRange(filters);

    const qb = this.tripsRepo
      .createQueryBuilder('t')
      .select('coop.id', 'cooperative_id')
      .addSelect('coop.name', 'cooperative_name')
      .addSelect('COUNT(t.id)', 'total_trips')
      .addSelect('SUM(CAST(t.fare_amount AS DECIMAL(10,2)))', 'total_revenue')
      .addSelect('SUM(CAST(t.commission_amount AS DECIMAL(10,2)))', 'total_commission')
      .innerJoin('t.cooperative', 'coop')
      .where('t.status = :status', { status: TripStatus.COMPLETED })
      .groupBy('coop.id')
      .addGroupBy('coop.name')
      .orderBy('total_revenue', 'DESC');

    if (from) qb.andWhere('t.completed_at >= :from', { from });
    if (to) qb.andWhere('t.completed_at <= :to', { to });

    return qb.getRawMany();
  }

  // ── CSV export ─────────────────────────────────────────────────────────────

  async exportTripsCsv(user: User, filters: ReportFiltersDto): Promise<string> {
    const { items } = await this.getTrips(user, { ...filters, limit: 5000, page: 1 });

    const headers = [
      'trip_id', 'completed_at', 'driver_name', 'cooperative',
      'origin', 'destination', 'fare_mode', 'fare_amount',
      'commission_rate', 'commission_amount', 'net_to_driver',
    ];

    const rows = items.map(t => [
      t.id,
      t.completed_at ? new Date(t.completed_at).toISOString() : '',
      (t.driver as any)?.full_name ?? '',
      (t.cooperative as any)?.name ?? '',
      t.origin_address,
      t.destination_address,
      t.fare_mode,
      t.fare_amount ?? '',
      t.commission_rate ?? '',
      t.commission_amount ?? '',
      (parseFloat(t.fare_amount as any || '0') - parseFloat(t.commission_amount as any || '0')).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    return [headers.join(','), ...rows].join('\n');
  }

  // ── Saldos de wallets ──────────────────────────────────────────────────────

  async getWalletBalances(user: User, filters: ReportFiltersDto) {
    const coopId = await this.resolveCoopId(user, filters.cooperative_id);

    const qb = this.walletsRepo
      .createQueryBuilder('w')
      .leftJoinAndSelect('w.driver', 'd')
      .orderBy('w.balance', 'ASC'); // más negativo primero (más deuda)

    if (coopId) {
      // Wallets de conductores que tienen viajes en esa coop
      qb.where(sq => {
        const subQuery = sq
          .subQuery()
          .select('DISTINCT t.driver_id')
          .from(Trip, 't')
          .where('t.cooperative_id = :coopId')
          .getQuery();
        return `d.id IN ${subQuery}`;
      }).setParameter('coopId', coopId);
    }

    return qb.getMany();
  }

  private parseDateRange(filters: ReportFiltersDto) {
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(new Date(filters.to).setHours(23, 59, 59, 999)) : null;
    return { from, to };
  }
}
