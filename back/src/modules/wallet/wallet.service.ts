import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { DriverWallet } from './entities/driver-wallet.entity';
import { Recharge, RechargeStatus } from './entities/recharge.entity';
import { WalletTransaction, TransactionType } from './entities/wallet-transaction.entity';
import { BankAccount, AccountType } from './entities/bank-account.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/entities/app-notification.entity';
import { StorageService } from '../storage/storage.service';
import { RequestRechargeDto } from './dto/request-recharge.dto';
import { RejectRechargeDto } from './dto/reject-recharge.dto';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(DriverWallet)
    private walletRepo: Repository<DriverWallet>,
    @InjectRepository(Recharge)
    private rechargeRepo: Repository<Recharge>,
    @InjectRepository(WalletTransaction)
    private txRepo: Repository<WalletTransaction>,
    @InjectRepository(Driver)
    private driversRepo: Repository<Driver>,
    @InjectRepository(BankAccount)
    private bankAccountRepo: Repository<BankAccount>,
    @InjectRepository(User)
    private usersRepo: Repository<User>,
    @InjectDataSource()
    private dataSource: DataSource,
    private storage: StorageService,
    private notificationsService: NotificationsService,
  ) {}

  // ── Driver ──────────────────────────────────────────────────────────────────

  async getMyWallet(userId: string) {
    const wallet = await this.findWalletByUser(userId);
    return wallet;
  }

  async getMyTransactions(userId: string, page = 1, limit = 20) {
    const wallet = await this.findWalletByUser(userId);
    const [items, total] = await this.txRepo.findAndCount({
      where: { wallet: { id: wallet.id } },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async requestRecharge(userId: string, dto: RequestRechargeDto, file: Express.Multer.File) {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const wallet = await this.findWalletByUser(userId);

    const amount = parseFloat(dto.amount);
    if (isNaN(amount) || amount <= 0) throw new BadRequestException('Monto inválido');
    if (amount < 5) throw new BadRequestException('Recarga mínima: $5.00');
    if (amount > 500) throw new BadRequestException('Recarga máxima: $500.00');

    const pendingExists = await this.rechargeRepo.findOne({
      where: { wallet: { id: wallet.id }, status: RechargeStatus.PENDING },
    });
    if (pendingExists) {
      throw new ConflictException('Ya tienes una recarga pendiente de confirmación');
    }

    if (!file) throw new BadRequestException('Comprobante de transferencia requerido');
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Solo JPEG, PNG o PDF');
    if (file.size > 10 * 1024 * 1024) throw new BadRequestException('Máximo 10MB');

    const key = await this.storage.upload(
      `drivers/${driver.id}/recharges`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    let bankAccount: BankAccount | null = null;
    if (dto.bank_account_id) {
      bankAccount = await this.bankAccountRepo.findOne({ where: { id: dto.bank_account_id } });
    }

    const recharge = await this.rechargeRepo.save(
      this.rechargeRepo.create({
        wallet,
        amount: amount.toFixed(2),
        method: dto.method,
        proof_url: key,
        status: RechargeStatus.PENDING,
        ...(bankAccount && { bank_account: bankAccount }),
        ...(dto.driver_notes && { driver_notes: dto.driver_notes }),
      }),
    );

    // Notify finance staff (fire-and-forget)
    this.usersRepo
      .find({
        where: { role: In([UserRole.OWNER, UserRole.PLATFORM_ADMIN, UserRole.FINANCE]) },
        select: ['id'],
      })
      .then((staff) => {
        const staffIds = staff.map((u) => u.id);
        return this.notificationsService.sendToUsers(staffIds, {
          title: '💳 Nueva solicitud de recarga',
          body: `El conductor solicitó una recarga de $${amount.toFixed(2)}. Revisa la sección de Contabilidad.`,
          type: NotificationType.WALLET,
        });
      })
      .catch(() => {});

    return {
      message: 'Solicitud de recarga enviada. FINANCE la revisará en breve.',
      recharge_id: recharge.id,
    };
  }

  async getMyRecharges(userId: string, page = 1, limit = 20) {
    const wallet = await this.findWalletByUser(userId);
    const [items, total] = await this.rechargeRepo.findAndCount({
      where: { wallet: { id: wallet.id } },
      relations: ['bank_account'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  // ── Finance ─────────────────────────────────────────────────────────────────

  async listRecharges(page = 1, limit = 20, status?: string) {
    const where = status ? { status: status as RechargeStatus } : {};
    const [items, total] = await this.rechargeRepo.findAndCount({
      where,
      relations: ['wallet', 'wallet.driver', 'bank_account'],
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    // Flatten driver name for frontend convenience
    const enriched = items.map((r) => ({
      ...r,
      driver_name: (r.wallet as any)?.driver?.full_name ?? null,
    }));
    return { items: enriched, total, page, limit };
  }

  async listPendingRecharges(page = 1, limit = 20) {
    return this.listRecharges(page, limit, RechargeStatus.PENDING);
  }

  async getRechargeProofUrl(rechargeId: string) {
    const recharge = await this.rechargeRepo.findOne({ where: { id: rechargeId } });
    if (!recharge) throw new NotFoundException('Recarga no encontrada');
    return { url: await this.storage.getPresignedUrl(recharge.proof_url), expires_in: 3600 };
  }

  async confirmRecharge(rechargeId: string, staffUser: User) {
    const recharge = await this.rechargeRepo.findOne({
      where: { id: rechargeId },
      relations: ['wallet'],
    });
    if (!recharge) throw new NotFoundException('Recarga no encontrada');
    if (recharge.status !== RechargeStatus.PENDING) {
      throw new BadRequestException('La recarga ya fue procesada');
    }

    const amount = parseFloat(recharge.amount);

    await this.dataSource.transaction(async (em) => {
      const wallet = await em.findOne(DriverWallet, {
        where: { id: recharge.wallet.id },
        lock: { mode: 'pessimistic_write' },
      });

      const balanceBefore = parseFloat(wallet.balance);
      const balanceAfter = +(balanceBefore + amount).toFixed(2);

      await em.update(DriverWallet, wallet.id, { balance: balanceAfter.toString() });

      await em.save(WalletTransaction, em.create(WalletTransaction, {
        wallet,
        type: TransactionType.RECHARGE,
        amount: recharge.amount,
        balance_before: balanceBefore.toFixed(2),
        balance_after: balanceAfter.toFixed(2),
        reference_id: recharge.id,
        notes: `Recarga confirmada por ${staffUser.email}`,
      }));

      await em.update(Recharge, recharge.id, {
        status: RechargeStatus.CONFIRMED,
        confirmed_by: staffUser,
        confirmed_at: new Date(),
      });
    });

    return { message: `Recarga de $${amount.toFixed(2)} confirmada y acreditada` };
  }

  async rejectRecharge(rechargeId: string, dto: RejectRechargeDto) {
    const recharge = await this.rechargeRepo.findOne({ where: { id: rechargeId } });
    if (!recharge) throw new NotFoundException('Recarga no encontrada');
    if (recharge.status !== RechargeStatus.PENDING) {
      throw new BadRequestException('La recarga ya fue procesada');
    }

    await this.rechargeRepo.update(rechargeId, {
      status: RechargeStatus.REJECTED,
      rejection_reason: dto.reason,
    });

    return { message: 'Recarga rechazada' };
  }

  // ── Deducción de comisión (llamado internamente por trips) ───────────────────

  async deductCommission(
    walletId: string,
    amount: number,
    tripId: string,
    em?: import('typeorm').EntityManager,
  ): Promise<void> {
    const repo = em ?? this.dataSource.manager;

    const wallet = await repo.findOne(DriverWallet, {
      where: { id: walletId },
      lock: em ? { mode: 'pessimistic_write' } : undefined,
    });
    if (!wallet) throw new NotFoundException('Wallet no encontrada');

    const balanceBefore = parseFloat(wallet.balance);
    // El saldo puede ser negativo — el conductor debe la comisión a la coop
    const balanceAfter = +(balanceBefore - amount).toFixed(2);

    await repo.update(DriverWallet, wallet.id, { balance: balanceAfter.toString() });

    await repo.save(
      repo.create(WalletTransaction, {
        wallet,
        type: TransactionType.COMMISSION_DEDUCTION,
        amount: amount.toFixed(2),
        balance_before: balanceBefore.toFixed(2),
        balance_after: balanceAfter.toFixed(2),
        reference_id: tripId,
      }),
    );
  }

  // ── Bank accounts ────────────────────────────────────────────────────────────

  async getBankAccounts(onlyActive = true) {
    const accounts = await this.bankAccountRepo.find({
      where: onlyActive ? { is_active: true } : {},
      order: { created_at: 'ASC' },
    });
    // Resolve logo_url: si es una key de R2 (no empieza con http) → generar presigned URL
    return Promise.all(
      accounts.map(async (a) => {
        if (a.logo_url && !a.logo_url.startsWith('http')) {
          return { ...a, logo_url: await this.storage.getPresignedUrl(a.logo_url, 604800) };
        }
        return a;
      }),
    );
  }

  async uploadBankLogo(file: Express.Multer.File): Promise<{ logo_url: string }> {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.mimetype)) throw new BadRequestException('Solo JPEG, PNG, WebP o SVG');
    if (file.size > 2 * 1024 * 1024) throw new BadRequestException('Máximo 2MB');
    const key = await this.storage.upload('bank-logos', file.originalname, file.buffer, file.mimetype);
    const url = await this.storage.getPresignedUrl(key, 604800); // 7 días
    // Guardamos el key en DB, devolvemos la URL resuelta al front
    return { logo_url: key, resolved_url: url } as any;
  }

  async createBankAccount(dto: CreateBankAccountDto) {
    return this.bankAccountRepo.save(this.bankAccountRepo.create(dto));
  }

  async updateBankAccount(id: string, dto: Partial<CreateBankAccountDto> & { is_active?: boolean }) {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');
    Object.assign(account, dto);
    return this.bankAccountRepo.save(account);
  }

  async deleteBankAccount(id: string) {
    const account = await this.bankAccountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');
    account.is_active = false;
    await this.bankAccountRepo.save(account);
    return { message: 'Cuenta desactivada' };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async findWalletByUser(userId: string): Promise<DriverWallet> {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    let wallet = await this.walletRepo.findOne({ where: { driver: { id: driver.id } } });
    if (!wallet) {
      // Auto-crear wallet con saldo 0 la primera vez
      wallet = await this.walletRepo.save(
        this.walletRepo.create({ driver, balance: '0.00' }),
      );
    }

    return wallet;
  }
}
