import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, Between } from 'typeorm';
import { CooperativeAccount } from './entities/cooperative-account.entity';
import { CoopAccountTx, CoopTxType } from './entities/coop-account-tx.entity';
import { CooperativeSettlement, SettlementStatus } from './entities/cooperative-settlement.entity';
import { SystemConfig } from '../platform/entities/system-config.entity';
import { User } from '../users/entities/user.entity';
import { CreateSettlementDto } from './dto/create-settlement.dto';
import { ConfirmSettlementDto } from './dto/confirm-settlement.dto';
import { AccountingFiltersDto } from './dto/accounting-filters.dto';

const PLATFORM_FEE_KEY = 'platform_fee_rate';
const DEFAULT_PLATFORM_FEE = 0.10; // 10% por defecto

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(CooperativeAccount)
    private accountRepo: Repository<CooperativeAccount>,
    @InjectRepository(CoopAccountTx)
    private txRepo: Repository<CoopAccountTx>,
    @InjectRepository(CooperativeSettlement)
    private settlementRepo: Repository<CooperativeSettlement>,
    @InjectRepository(SystemConfig)
    private configRepo: Repository<SystemConfig>,
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  // ── Llamado internamente por trips al completar un viaje ─────────────────────

  async creditCoopCommission(
    cooperativeId: string,
    commissionAmount: number,
    tripId: string,
    em?: import('typeorm').EntityManager,
  ): Promise<void> {
    const manager = em ?? this.dataSource.manager;

    // INSERT IGNORE (no SELECT-then-INSERT) para crear la cuenta la primera
    // vez: dos viajes de la misma cooperativa completando en simultáneo
    // podían ambos hacer el SELECT, no encontrar nada, e intentar el INSERT
    // a la vez sobre la unique key de cooperative_id — MySQL/InnoDB resuelve
    // eso como deadlock (ER_LOCK_DEADLOCK), no como duplicate-key limpio.
    // Con IGNORE, quien gana crea la fila y el resto no hace nada; todos
    // siguen al SELECT ... FOR UPDATE de abajo, que ya encuentra la cuenta.
    await manager
      .createQueryBuilder()
      .insert()
      .into(CooperativeAccount)
      .values({
        cooperative_id: cooperativeId,
        gross_balance: '0.00',
        platform_due: '0.00',
        net_balance: '0.00',
      })
      .orIgnore()
      .execute();

    const account = await manager.findOne(CooperativeAccount, {
      where: { cooperative_id: cooperativeId },
      lock: em ? { mode: 'pessimistic_write' } : undefined,
    });

    const platformRate = await this.getPlatformFeeRate(manager);
    const platformCut = +(commissionAmount * platformRate).toFixed(2);
    const coopNet = +(commissionAmount - platformCut).toFixed(2);

    const grossBefore = parseFloat(account.gross_balance);
    const grossAfter = +(grossBefore + commissionAmount).toFixed(2);
    const platformDueAfter = +(parseFloat(account.platform_due) + platformCut).toFixed(2);
    const netAfter = +(parseFloat(account.net_balance) + coopNet).toFixed(2);

    await manager.update(CooperativeAccount, account.id, {
      gross_balance: grossAfter.toFixed(2),
      platform_due: platformDueAfter.toFixed(2),
      net_balance: netAfter.toFixed(2),
    });

    await manager.save(
      manager.create(CoopAccountTx, {
        account_id: account.id,
        type: CoopTxType.COMMISSION_CREDIT,
        amount: commissionAmount.toFixed(2),
        gross_before: grossBefore.toFixed(2),
        gross_after: grossAfter.toFixed(2),
        reference_id: tripId,
        notes: `Comisión de viaje ${tripId}. Plataforma: $${platformCut.toFixed(2)}`,
      }),
    );
  }

  // ── Cuenta de la cooperativa ─────────────────────────────────────────────────

  async getCoopAccount(cooperativeId: string) {
    const account = await this.accountRepo.findOne({
      where: { cooperative_id: cooperativeId },
      relations: ['cooperative'],
    });
    if (!account) throw new NotFoundException('Cuenta contable no encontrada. Completa un viaje primero.');
    return account;
  }

  async getCoopStatement(filters: AccountingFiltersDto) {
    const { cooperative_id, from, to, page = 1, limit = 20 } = filters;
    if (!cooperative_id) throw new BadRequestException('cooperative_id requerido');

    const account = await this.accountRepo.findOne({ where: { cooperative_id } });
    if (!account) throw new NotFoundException('Cuenta contable no encontrada');

    const where: any = { account_id: account.id };
    if (from && to) where.created_at = Between(new Date(from), new Date(to));
    else if (from) where.created_at = Between(new Date(from), new Date());

    const [items, total] = await this.txRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { account, items, total, page, limit };
  }

  // ── Estado de cuenta por conductor (desde wallet transactions) ───────────────

  async getDriverStatement(filters: AccountingFiltersDto) {
    const { cooperative_id, from, to, page = 1, limit = 20 } = filters;
    if (!cooperative_id) throw new BadRequestException('cooperative_id requerido');

    // Traemos transacciones de comisión de conductores de esa cooperativa
    const qb = this.dataSource.manager
      .createQueryBuilder()
      .select([
        'wt.id', 'wt.type', 'wt.amount', 'wt.balance_before', 'wt.balance_after',
        'wt.reference_id', 'wt.created_at',
        'd.id AS driver_id',
        'u.full_name AS driver_name',
        'u.phone AS driver_phone',
      ])
      .from('wallet_transactions', 'wt')
      .innerJoin('driver_wallets', 'dw', 'dw.id = wt.wallet_id')
      .innerJoin('drivers', 'd', 'd.id = dw.driver_id')
      .innerJoin('users', 'u', 'u.id = d.user_id')
      .innerJoin('cooperative_members', 'cm', 'cm.driver_id = d.id AND cm.cooperative_id = :cid', { cid: cooperative_id })
      .where("wt.type = 'commission_deduction'");

    if (from) qb.andWhere('wt.created_at >= :from', { from: new Date(from) });
    if (to) qb.andWhere('wt.created_at <= :to', { to: new Date(to) });

    const total = await qb.getCount();
    const items = await qb
      .orderBy('wt.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getRawMany();

    return { items, total, page, limit };
  }

  // ── Liquidaciones ────────────────────────────────────────────────────────────

  async createSettlement(dto: CreateSettlementDto, creator: User) {
    const account = await this.accountRepo.findOne({ where: { cooperative_id: dto.cooperative_id } });
    if (!account) throw new NotFoundException('La cooperativa no tiene cuenta contable');

    const from = new Date(dto.period_from);
    const to = new Date(dto.period_to);
    if (from >= to) throw new BadRequestException('period_from debe ser anterior a period_to');

    // Verificar que no haya liquidación pendiente en el mismo período
    const conflict = await this.settlementRepo
      .createQueryBuilder('s')
      .where('s.cooperative_id = :cid', { cid: dto.cooperative_id })
      .andWhere('s.status = :st', { st: SettlementStatus.PENDING })
      .getOne();
    if (conflict) throw new ConflictException('Ya existe una liquidación pendiente para esta cooperativa');

    // Calcular totales del período desde las transacciones
    const result = await this.txRepo
      .createQueryBuilder('tx')
      .select('SUM(CAST(tx.amount AS DECIMAL(12,2)))', 'gross')
      .where('tx.account_id = :id', { id: account.id })
      .andWhere('tx.type = :t', { t: CoopTxType.COMMISSION_CREDIT })
      .andWhere('tx.created_at BETWEEN :from AND :to', { from, to })
      .getRawOne();

    const gross = parseFloat(result?.gross ?? '0');
    if (gross <= 0) throw new BadRequestException('No hay comisiones en el período indicado');

    const platformRate = await this.getPlatformFeeRate();
    const platformFee = +(gross * platformRate).toFixed(2);
    const net = +(gross - platformFee).toFixed(2);

    const settlement = await this.settlementRepo.save(
      this.settlementRepo.create({
        cooperative_id: dto.cooperative_id,
        period_from: from,
        period_to: to,
        gross_amount: gross.toFixed(2),
        platform_fee: platformFee.toFixed(2),
        net_amount: net.toFixed(2),
        status: SettlementStatus.PENDING,
        created_by_id: creator.id,
        notes: dto.notes ?? null,
      }),
    );

    return { message: 'Liquidación creada, pendiente de confirmación', settlement };
  }

  async confirmSettlement(settlementId: string, confirmer: User, dto: ConfirmSettlementDto) {
    const settlement = await this.settlementRepo.findOne({
      where: { id: settlementId },
      relations: ['cooperative'],
    });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('La liquidación ya fue procesada');
    }

    const net = parseFloat(settlement.net_amount);
    const platformFee = parseFloat(settlement.platform_fee);

    await this.dataSource.transaction(async (em) => {
      const account = await em.findOne(CooperativeAccount, {
        where: { cooperative_id: settlement.cooperative_id },
        lock: { mode: 'pessimistic_write' },
      });

      const grossBefore = parseFloat(account.gross_balance);
      const grossAfter = +(grossBefore - parseFloat(settlement.gross_amount)).toFixed(2);
      const platformDueAfter = +(parseFloat(account.platform_due) - platformFee).toFixed(2);
      const netAfter = +(parseFloat(account.net_balance) - net).toFixed(2);

      await em.update(CooperativeAccount, account.id, {
        gross_balance: Math.max(0, grossAfter).toFixed(2),
        platform_due: Math.max(0, platformDueAfter).toFixed(2),
        net_balance: Math.max(0, netAfter).toFixed(2),
      });

      await em.save(
        em.create(CoopAccountTx, {
          account_id: account.id,
          type: CoopTxType.SETTLEMENT_DEBIT,
          amount: net.toFixed(2),
          gross_before: grossBefore.toFixed(2),
          gross_after: Math.max(0, grossAfter).toFixed(2),
          reference_id: settlementId,
          notes: `Liquidación confirmada por ${confirmer.email}`,
        }),
      );

      await em.update(CooperativeSettlement, settlementId, {
        status: SettlementStatus.CONFIRMED,
        confirmed_by_id: confirmer.id,
        confirmed_at: new Date(),
        notes: dto.notes ?? settlement.notes,
      });
    });

    return { message: `Liquidación confirmada. Neto pagado: $${net.toFixed(2)}` };
  }

  async cancelSettlement(settlementId: string) {
    const settlement = await this.settlementRepo.findOne({ where: { id: settlementId } });
    if (!settlement) throw new NotFoundException('Liquidación no encontrada');
    if (settlement.status !== SettlementStatus.PENDING) {
      throw new BadRequestException('Solo se pueden cancelar liquidaciones pendientes');
    }
    await this.settlementRepo.update(settlementId, { status: SettlementStatus.CANCELLED });
    return { message: 'Liquidación cancelada' };
  }

  async listSettlements(filters: AccountingFiltersDto) {
    const { cooperative_id, from, to, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (cooperative_id) where.cooperative_id = cooperative_id;
    if (from && to) where.created_at = Between(new Date(from), new Date(to));

    const [items, total] = await this.settlementRepo.findAndCount({
      where,
      relations: ['cooperative', 'created_by', 'confirmed_by'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  // ── Config ───────────────────────────────────────────────────────────────────

  async getPlatformFeeConfig() {
    const config = await this.configRepo.findOne({ where: { key: PLATFORM_FEE_KEY } });
    return { platform_fee_rate: parseFloat(config?.value ?? String(DEFAULT_PLATFORM_FEE)) };
  }

  async setPlatformFeeRate(rate: number) {
    if (rate < 0 || rate > 1) throw new BadRequestException('La tasa debe estar entre 0 y 1');
    await this.configRepo.upsert(
      { key: PLATFORM_FEE_KEY, value: rate.toString(), description: 'Tasa de fee de plataforma sobre comisiones de cooperativa' },
      ['key'],
    );
    return { message: 'Tasa de plataforma actualizada', platform_fee_rate: rate };
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async getPlatformFeeRate(manager?: import('typeorm').EntityManager): Promise<number> {
    const repo = manager ? manager.getRepository(SystemConfig) : this.configRepo;
    const config = await repo.findOne({ where: { key: PLATFORM_FEE_KEY } });
    return parseFloat(config?.value ?? String(DEFAULT_PLATFORM_FEE));
  }
}
