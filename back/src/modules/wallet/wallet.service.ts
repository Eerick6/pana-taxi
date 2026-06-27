import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { DriverWallet } from './entities/driver-wallet.entity';
import { Recharge, RechargeStatus } from './entities/recharge.entity';
import { WalletTransaction, TransactionType } from './entities/wallet-transaction.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { User } from '../users/entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { RequestRechargeDto } from './dto/request-recharge.dto';
import { RejectRechargeDto } from './dto/reject-recharge.dto';

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
    @InjectDataSource()
    private dataSource: DataSource,
    private storage: StorageService,
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
      `wallets/${wallet.id}/recharges`,
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    const recharge = await this.rechargeRepo.save(
      this.rechargeRepo.create({
        wallet,
        amount: amount.toFixed(2),
        method: dto.method,
        proof_url: key,
        status: RechargeStatus.PENDING,
      }),
    );

    return {
      message: 'Solicitud de recarga enviada. FINANCE la revisará en breve.',
      recharge_id: recharge.id,
    };
  }

  async getMyRecharges(userId: string, page = 1, limit = 20) {
    const wallet = await this.findWalletByUser(userId);
    const [items, total] = await this.rechargeRepo.findAndCount({
      where: { wallet: { id: wallet.id } },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  // ── Finance ─────────────────────────────────────────────────────────────────

  async listPendingRecharges(page = 1, limit = 20) {
    const [items, total] = await this.rechargeRepo.findAndCount({
      where: { status: RechargeStatus.PENDING },
      relations: ['wallet', 'wallet.driver', 'wallet.driver.user'],
      order: { created_at: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
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

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async findWalletByUser(userId: string): Promise<DriverWallet> {
    const driver = await this.driversRepo.findOne({ where: { user: { id: userId } } });
    if (!driver) throw new NotFoundException('Perfil de conductor no encontrado');

    const wallet = await this.walletRepo.findOne({ where: { driver: { id: driver.id } } });
    if (!wallet) throw new NotFoundException('Wallet no encontrada');

    return wallet;
  }
}
