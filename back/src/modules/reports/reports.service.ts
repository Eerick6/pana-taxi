import { Injectable, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trip, TripStatus } from '../trips/entities/trip.entity';
import { DriverWallet } from '../wallet/entities/driver-wallet.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { Cooperative, CooperativeApprovalStatus, CooperativeStatus } from '../cooperatives/entities/cooperative.entity';
import { Vehicle, VehicleApprovalStatus } from '../vehicles/entities/vehicle.entity';
import { Driver, DriverApprovalStatus, DriverOnlineStatus } from '../drivers/entities/driver.entity';
import { Client } from '../clients/entities/client.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Trip)
    private tripsRepo: Repository<Trip>,
    @InjectRepository(DriverWallet)
    private walletsRepo: Repository<DriverWallet>,
    @InjectRepository(CooperativeMember)
    private membersRepo: Repository<CooperativeMember>,
    @InjectRepository(Cooperative)
    private cooperativesRepo: Repository<Cooperative>,
    @InjectRepository(Vehicle)
    private vehiclesRepo: Repository<Vehicle>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(Client)
    private clientsRepo: Repository<Client>,
    @InjectRepository(WalletTransaction)
    private walletTxRepo: Repository<WalletTransaction>,
  ) {}

  // ── Dashboard stats (super admin) ─────────────────────────────────────────

  async getDashboardStats(cooperativeId?: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 6);
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now);
    startOfMonth.setDate(now.getDate() - 29);
    startOfMonth.setHours(0, 0, 0, 0);

    // Build pre-conditioned trip query builders (avoids setParameters overwriting coopId)
    const tripStatusQb = this.tripsRepo.createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('t.status');

    const tripPeriodQb = this.tripsRepo.createQueryBuilder('t')
      .select(`SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :today THEN 1 ELSE 0 END)`, 'completed_today')
      .addSelect(`SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :week THEN 1 ELSE 0 END)`, 'completed_week')
      .addSelect(`SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :month THEN 1 ELSE 0 END)`, 'completed_month')
      .addSelect(`SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END)`, 'completed_all')
      .addSelect(`SUM(CASE WHEN t.status = 'cancelled' AND t.created_at >= :today THEN 1 ELSE 0 END)`, 'cancelled_today')
      .addSelect(`SUM(CASE WHEN t.status = 'cancelled' AND t.created_at >= :week THEN 1 ELSE 0 END)`, 'cancelled_week')
      .addSelect(`SUM(CASE WHEN t.status = 'cancelled' AND t.created_at >= :month THEN 1 ELSE 0 END)`, 'cancelled_month')
      .addSelect(`SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END)`, 'cancelled_all')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :today THEN CAST(t.fare_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'revenue_today')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :week THEN CAST(t.fare_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'revenue_week')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :month THEN CAST(t.fare_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'revenue_month')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' THEN CAST(t.fare_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'revenue_all')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :today THEN CAST(t.commission_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'commission_today')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :week THEN CAST(t.commission_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'commission_week')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' AND t.completed_at >= :month THEN CAST(t.commission_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'commission_month')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' THEN CAST(t.commission_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'commission_all')
      .setParameter('today', startOfToday)
      .setParameter('week', startOfWeek)
      .setParameter('month', startOfMonth);

    const topCoopsQb = this.tripsRepo.createQueryBuilder('t')
      .select('c.id', 'id')
      .addSelect('c.name', 'name')
      .addSelect('COUNT(t.id)', 'total_trips')
      .addSelect('COALESCE(SUM(CAST(t.fare_amount AS DECIMAL(10,2))), 0)', 'total_revenue')
      .addSelect('COALESCE(SUM(CAST(t.commission_amount AS DECIMAL(10,2))), 0)', 'total_commission')
      .innerJoin('t.cooperative', 'c')
      .where('t.status = :cs', { cs: 'completed' })
      .groupBy('c.id').addGroupBy('c.name')
      .orderBy('total_revenue', 'DESC')
      .limit(3);

    const topDriversQb = this.tripsRepo.createQueryBuilder('t')
      .select('d.id', 'id')
      .addSelect('d.full_name', 'full_name')
      .addSelect('COUNT(DISTINCT t.id)', 'total_trips')
      .addSelect('ROUND(AVG(r.score), 1)', 'avg_rating')
      .innerJoin('t.driver', 'd')
      .leftJoin('ratings', 'r', `r.driver_id = d.id AND r.direction = 'client_to_driver'`)
      .where('t.status = :ds', { ds: 'completed' })
      .groupBy('d.id').addGroupBy('d.full_name')
      .orderBy('total_trips', 'DESC')
      .limit(3);

    const coopBreakdownQb = this.cooperativesRepo.createQueryBuilder('c')
      .select('c.id', 'id')
      .addSelect('c.name', 'name')
      .addSelect('c.status', 'status')
      .addSelect('COUNT(DISTINCT v.id)', 'vehicle_count')
      .addSelect('COUNT(DISTINCT co.owner_id)', 'owner_count')
      .addSelect(`COUNT(DISTINCT CASE WHEN d.online_status IN ('online', 'busy') THEN d.id END)`, 'active_now')
      .leftJoin('vehicles', 'v', `v.cooperative_id = c.id AND v.approval_status = 'approved'`)
      .leftJoin('cooperative_owners', 'co', `co.cooperative_id = c.id AND co.approval_status = 'approved'`)
      .leftJoin('drivers', 'd', `d.id = co.owner_id AND d.online_status IN ('online', 'busy')`)
      .where('c.approval_status = :capproved', { capproved: 'approved' })
      .groupBy('c.id').addGroupBy('c.name').addGroupBy('c.status')
      .orderBy('c.name', 'ASC');

    // Apply cooperative filter where relevant
    if (cooperativeId) {
      tripStatusQb.andWhere('t.cooperative_id = :coopId', { coopId: cooperativeId });
      tripPeriodQb.andWhere('t.cooperative_id = :coopId', { coopId: cooperativeId });
      topCoopsQb.andWhere('t.cooperative_id = :coopId', { coopId: cooperativeId });
      topDriversQb.andWhere('t.cooperative_id = :coopId', { coopId: cooperativeId });
      coopBreakdownQb.andWhere('c.id = :coopId', { coopId: cooperativeId });
    }

    const [
      totalCoops,
      totalVehicles,
      totalDrivers,
      totalClients,
      onlineDrivers,
      tripStatusCounts,
      tripPeriodStats,
      walletStats,
      topCoops,
      topDrivers,
      topClients,
      coopBreakdown,
    ] = await Promise.all([
      // Global cooperative count (platform metric, always total)
      this.cooperativesRepo.count({ where: { approval_status: CooperativeApprovalStatus.APPROVED } }),

      // Vehicles — filtered by coop when selected
      cooperativeId
        ? this.vehiclesRepo.createQueryBuilder('v')
            .where('v.cooperative_id = :coopId', { coopId: cooperativeId })
            .andWhere('v.approval_status = :ap', { ap: VehicleApprovalStatus.APPROVED })
            .getCount()
        : this.vehiclesRepo.count({ where: { approval_status: VehicleApprovalStatus.APPROVED } }),

      // Drivers — filtered by coop owners when selected
      cooperativeId
        ? this.driversRepo.createQueryBuilder('d')
            .innerJoin('cooperative_owners', 'co', 'co.owner_id = d.id AND co.cooperative_id = :coopId AND co.approval_status = :capproved', { coopId: cooperativeId, capproved: 'approved' })
            .where('d.approval_status = :approved', { approved: DriverApprovalStatus.APPROVED })
            .getCount()
        : this.driversRepo.count({ where: { approval_status: DriverApprovalStatus.APPROVED } }),

      // Clients — always global
      this.clientsRepo.count(),

      // Online drivers — filtered by coop when selected
      cooperativeId
        ? this.driversRepo.createQueryBuilder('d')
            .innerJoin('cooperative_owners', 'co', 'co.owner_id = d.id AND co.cooperative_id = :coopId AND co.approval_status = :capproved', { coopId: cooperativeId, capproved: 'approved' })
            .where('d.online_status IN (:...statuses)', { statuses: ['online', 'busy'] })
            .getCount()
        : this.driversRepo.createQueryBuilder('d')
            .where('d.online_status IN (:...statuses)', { statuses: ['online', 'busy'] })
            .getCount(),

      tripStatusQb.getRawMany(),
      tripPeriodQb.getRawOne(),

      // Wallet stats — global financial totals
      this.walletTxRepo.createQueryBuilder('wt')
        .select(`COALESCE(SUM(CASE WHEN wt.type = 'recharge' THEN CAST(wt.amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'total_recharges')
        .addSelect(`COALESCE(SUM(CASE WHEN wt.type = 'commission_deduction' THEN CAST(wt.amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'total_commissions_deducted')
        .addSelect(`COALESCE(SUM(CASE WHEN wt.type = 'recharge' AND wt.created_at >= :month THEN CAST(wt.amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'month_recharges')
        .addSelect(`COALESCE(SUM(CASE WHEN wt.type = 'commission_deduction' AND wt.created_at >= :month THEN CAST(wt.amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'month_commissions_deducted')
        .setParameter('month', startOfMonth)
        .getRawOne(),

      topCoopsQb.getRawMany(),
      topDriversQb.getRawMany(),

      // Top clients — global
      this.tripsRepo.createQueryBuilder('t')
        .select('cl.id', 'id')
        .addSelect('cl.full_name', 'full_name')
        .addSelect('cl.rating', 'rating')
        .addSelect('COUNT(t.id)', 'total_trips')
        .innerJoin(Client, 'cl', 'cl.user_id = t.client_id')
        .where('t.status = :cls', { cls: 'completed' })
        .andWhere('t.client_id IS NOT NULL')
        .groupBy('cl.id').addGroupBy('cl.full_name').addGroupBy('cl.rating')
        .orderBy('total_trips', 'DESC')
        .limit(3)
        .getRawMany(),

      coopBreakdownQb.getRawMany(),
    ]);

    const statusMap: Record<string, number> = {};
    for (const row of tripStatusCounts) {
      statusMap[row.status] = parseInt(row.cnt);
    }

    const n = (v: any) => parseFloat(v ?? '0');
    const i = (v: any) => parseInt(v ?? '0');
    const p = tripPeriodStats ?? {};
    const w = walletStats ?? {};

    return {
      overview: {
        cooperatives: totalCoops,
        vehicles: totalVehicles,
        drivers: totalDrivers,
        clients: totalClients,
        online_now: onlineDrivers,
      },
      trips: {
        in_progress: (statusMap['in_progress'] || 0) + (statusMap['accepted'] || 0) + (statusMap['driver_arrived'] || 0),
        waiting: (statusMap['requested'] || 0) + (statusMap['negotiating'] || 0),
        completed: { today: i(p.completed_today), week: i(p.completed_week), month: i(p.completed_month), all: i(p.completed_all) },
        cancelled: { today: i(p.cancelled_today), week: i(p.cancelled_week), month: i(p.cancelled_month), all: i(p.cancelled_all) },
        revenue: { today: n(p.revenue_today), week: n(p.revenue_week), month: n(p.revenue_month), all: n(p.revenue_all) },
        commission: { today: n(p.commission_today), week: n(p.commission_week), month: n(p.commission_month), all: n(p.commission_all) },
      },
      financials: {
        total_recharges: n(w.total_recharges),
        total_commissions_deducted: n(w.total_commissions_deducted),
        month_recharges: n(w.month_recharges),
        month_commissions_deducted: n(w.month_commissions_deducted),
      },
      top_cooperatives: topCoops.map(r => ({
        id: r.id, name: r.name,
        total_trips: i(r.total_trips),
        total_revenue: n(r.total_revenue),
        total_commission: n(r.total_commission),
      })),
      top_drivers: topDrivers.map(r => ({
        id: r.id, full_name: r.full_name,
        total_trips: i(r.total_trips),
        avg_rating: n(r.avg_rating),
      })),
      top_clients: topClients.map(r => ({
        id: r.id, full_name: r.full_name,
        total_trips: i(r.total_trips),
        rating: n(r.rating),
      })),
      coop_breakdown: coopBreakdown.map(r => ({
        id: r.id, name: r.name, status: r.status,
        vehicle_count: i(r.vehicle_count),
        owner_count: i(r.owner_count),
        active_now: i(r.active_now),
      })),
    };
  }

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

  // ── Resumen global (para panel de reportes) ───────────────────────────────

  async getGlobal(from?: string, to?: string) {
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(new Date(to).setHours(23, 59, 59, 999)) : null;

    const qb = this.tripsRepo.createQueryBuilder('t')
      .select('COUNT(t.id)', 'total_trips')
      .addSelect(`SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END)`, 'completed_trips')
      .addSelect(`SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END)`, 'cancelled_trips')
      .addSelect(
        `COALESCE(AVG(CASE WHEN t.status = 'completed' AND t.started_at IS NOT NULL AND t.completed_at IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, t.started_at, t.completed_at) END), 0)`,
        'avg_duration_min',
      )
      .addSelect(`COALESCE(AVG(CASE WHEN t.status = 'completed' THEN CAST(t.fare_amount AS DECIMAL(10,2)) END), 0)`, 'avg_fare')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' THEN CAST(t.fare_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'total_revenue')
      .addSelect(`COALESCE(SUM(CASE WHEN t.status = 'completed' THEN CAST(t.commission_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`, 'total_commissions');

    if (fromDate) qb.andWhere('t.created_at >= :from', { from: fromDate });
    if (toDate) qb.andWhere('t.created_at <= :to', { to: toDate });

    const stats = await qb.getRawOne();

    const [active_drivers, active_cooperatives] = await Promise.all([
      this.driversRepo.count({ where: [
        { online_status: DriverOnlineStatus.ONLINE },
        { online_status: DriverOnlineStatus.BUSY },
      ]}),
      this.cooperativesRepo.count({
        where: { approval_status: CooperativeApprovalStatus.APPROVED, status: CooperativeStatus.ACTIVE },
      }),
    ]);

    const total = parseInt(stats.total_trips) || 0;
    const cancelled = parseInt(stats.cancelled_trips) || 0;

    return {
      total_trips: total,
      completed_trips: parseInt(stats.completed_trips) || 0,
      cancelled_trips: cancelled,
      cancellation_rate: total > 0 ? +(cancelled / total * 100).toFixed(1) : 0,
      avg_duration_min: +parseFloat(stats.avg_duration_min).toFixed(1),
      avg_fare: +parseFloat(stats.avg_fare).toFixed(2),
      total_revenue: +parseFloat(stats.total_revenue).toFixed(2),
      total_commissions: +parseFloat(stats.total_commissions).toFixed(2),
      active_drivers,
      active_cooperatives,
    };
  }

  // ── Puntos diarios (gráfico de línea) ─────────────────────────────────────

  async getDaily(from?: string, to?: string) {
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to
      ? new Date(new Date(to).setHours(23, 59, 59, 999))
      : new Date();

    const rows = await this.tripsRepo.createQueryBuilder('t')
      .select('DATE(t.created_at)', 'date')
      .addSelect('COUNT(t.id)', 'trips')
      .addSelect(
        `COALESCE(SUM(CASE WHEN t.status = 'completed' THEN CAST(t.fare_amount AS DECIMAL(10,2)) ELSE 0 END), 0)`,
        'revenue',
      )
      .addSelect(`SUM(CASE WHEN t.status = 'cancelled' THEN 1 ELSE 0 END)`, 'cancellations')
      .where('t.created_at >= :from', { from: fromDate })
      .andWhere('t.created_at <= :to', { to: toDate })
      .groupBy('DATE(t.created_at)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return rows.map(r => ({
      date: r.date,
      trips: parseInt(r.trips) || 0,
      revenue: +parseFloat(r.revenue).toFixed(2),
      cancellations: parseInt(r.cancellations) || 0,
    }));
  }

  private parseDateRange(filters: ReportFiltersDto) {
    const from = filters.from ? new Date(filters.from) : null;
    const to = filters.to ? new Date(new Date(filters.to).setHours(23, 59, 59, 999)) : null;
    return { from, to };
  }
}
