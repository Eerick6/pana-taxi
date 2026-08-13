import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { WalletService } from './wallet.service';
import { DriverWallet } from './entities/driver-wallet.entity';
import { Recharge } from './entities/recharge.entity';
import { WalletTransaction, TransactionType } from './entities/wallet-transaction.entity';
import { BankAccount } from './entities/bank-account.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { User } from '../users/entities/user.entity';
import { StorageService } from '../storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../gateway/events.gateway';

function makeRepo<T = any>() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn((dto: any) => dto),
    findAndCount: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as any;
}

describe('WalletService', () => {
  let service: WalletService;
  let walletRepo: ReturnType<typeof makeRepo<DriverWallet>>;
  let dataSource: { transaction: jest.Mock };
  let gateway: any;
  let notificationsService: any;

  beforeEach(async () => {
    walletRepo = makeRepo<DriverWallet>();

    dataSource = {
      transaction: jest.fn().mockImplementation(async (cb) => {
        const em = {
          findOne: jest.fn(),
          update: jest.fn(),
          save: jest.fn((entity: any, obj: any) => obj ?? entity),
          create: jest.fn((_entity: any, obj: any) => obj),
        };
        return cb(em);
      }),
    };

    gateway = {
      notifyUser: jest.fn(),
      notifyPlatform: jest.fn(),
      notifyCoop: jest.fn(),
      notifyDriver: jest.fn(),
    };

    notificationsService = { sendToUser: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getRepositoryToken(DriverWallet), useValue: walletRepo },
        { provide: getRepositoryToken(Recharge), useValue: makeRepo() },
        { provide: getRepositoryToken(WalletTransaction), useValue: makeRepo() },
        { provide: getRepositoryToken(Driver), useValue: makeRepo() },
        { provide: getRepositoryToken(BankAccount), useValue: makeRepo() },
        { provide: getRepositoryToken(User), useValue: makeRepo() },
        { provide: DataSource, useValue: dataSource },
        { provide: StorageService, useValue: { upload: jest.fn(), getPresignedUrl: jest.fn() } },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EventsGateway, useValue: gateway },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────────
  // creditCardEarning
  // ─────────────────────────────────────────────────────────────────────────────
  describe('creditCardEarning', () => {
    it('throws NotFoundException when the wallet does not exist', async () => {
      const em = { findOne: jest.fn().mockResolvedValue(null), update: jest.fn(), save: jest.fn(), create: jest.fn() };
      await expect(service.creditCardEarning('wallet-x', 10, 'trip-1', em as any)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('adds the amount to card_balance and records a CARD_EARNING transaction', async () => {
      const em = {
        findOne: jest.fn().mockResolvedValue({ id: 'wallet-1', card_balance: '5.00' }),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity: any, obj: any) => obj),
      };

      await service.creditCardEarning('wallet-1', 8.5, 'trip-1', em as any);

      expect(em.update).toHaveBeenCalledWith(DriverWallet, 'wallet-1', { card_balance: '13.5' });
      expect(em.create).toHaveBeenCalledWith(
        WalletTransaction,
        expect.objectContaining({
          type: TransactionType.CARD_EARNING,
          amount: '8.50',
          balance_before: '5.00',
          balance_after: '13.50',
          reference_id: 'trip-1',
        }),
      );
    });

    it('never lets the driver share turn into a platform loss by silently dropping cents', async () => {
      const em = {
        findOne: jest.fn().mockResolvedValue({ id: 'wallet-1', card_balance: '0.00' }),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_entity: any, obj: any) => obj),
      };

      await service.creditCardEarning('wallet-1', 9.99, 'trip-2', em as any);

      expect(em.update).toHaveBeenCalledWith(DriverWallet, 'wallet-1', { card_balance: '9.99' });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // getCardBalances
  // ─────────────────────────────────────────────────────────────────────────────
  describe('getCardBalances', () => {
    function makeQb(rows: any[]) {
      const qb: any = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      return qb;
    }

    it('maps wallets to a flattened driver-balance shape', async () => {
      const qb = makeQb([
        {
          id: 'wallet-1',
          card_balance: '42.50',
          updated_at: new Date('2026-01-01'),
          driver: { id: 'driver-1', full_name: 'Juan Pérez', user: { phone: '+593999000001' } },
        },
      ]);
      walletRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getCardBalances();

      expect(result).toEqual([
        {
          wallet_id: 'wallet-1',
          driver_id: 'driver-1',
          driver_name: 'Juan Pérez',
          driver_phone: '+593999000001',
          card_balance: '42.50',
          updated_at: new Date('2026-01-01'),
        },
      ]);
      expect(qb.andWhere).not.toHaveBeenCalled();
    });

    it('scopes to a single cooperative when cooperativeId is provided', async () => {
      const qb = makeQb([]);
      walletRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getCardBalances('coop-1');

      expect(qb.andWhere).toHaveBeenCalledWith('v.cooperative_id = :cooperativeId', {
        cooperativeId: 'coop-1',
      });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // payoutCardBalance
  // ─────────────────────────────────────────────────────────────────────────────
  describe('payoutCardBalance', () => {
    function walletWithCoop(coopId: string | null, cardBalance = '30.00') {
      return {
        id: 'wallet-1',
        card_balance: cardBalance,
        driver: {
          id: 'driver-1',
          user: { id: 'user-1' },
          active_vehicle: coopId ? { cooperative: { id: coopId } } : null,
        },
      };
    }

    it('throws NotFoundException when the wallet does not exist', async () => {
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ findOne: jest.fn().mockResolvedValue(null), update: jest.fn(), save: jest.fn(), create: jest.fn() }),
      );

      await expect(service.payoutCardBalance('wallet-x')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when card_balance is zero or negative', async () => {
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(walletWithCoop('coop-1', '0.00')),
          update: jest.fn(),
          save: jest.fn(),
          create: jest.fn((_e: any, o: any) => o),
        }),
      );

      await expect(service.payoutCardBalance('wallet-1')).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when the driver belongs to a different cooperative', async () => {
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({
          findOne: jest.fn().mockResolvedValue(walletWithCoop('coop-A')),
          update: jest.fn(),
          save: jest.fn(),
          create: jest.fn((_e: any, o: any) => o),
        }),
      );

      await expect(service.payoutCardBalance('wallet-1', undefined, 'coop-B')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('zeroes the balance, logs a CARD_PAYOUT transaction, and notifies the driver + coop + platform', async () => {
      const em = {
        findOne: jest.fn().mockResolvedValue(walletWithCoop('coop-1', '30.00')),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_e: any, o: any) => o),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(em));

      const result = await service.payoutCardBalance('wallet-1', 'pagado en efectivo', 'coop-1');

      expect(em.update).toHaveBeenCalledWith(DriverWallet, 'wallet-1', { card_balance: '0.00' });
      expect(em.create).toHaveBeenCalledWith(
        WalletTransaction,
        expect.objectContaining({
          type: TransactionType.CARD_PAYOUT,
          amount: '30.00',
          balance_before: '30.00',
          balance_after: '0.00',
          notes: 'pagado en efectivo',
        }),
      );
      expect(gateway.notifyUser).toHaveBeenCalledWith('user-1', 'wallet.card_payout', { amount: '30.00' });
      expect(gateway.notifyCoop).toHaveBeenCalledWith('coop-1', 'wallet.card_payout', { wallet_id: 'wallet-1' });
      expect(gateway.notifyPlatform).toHaveBeenCalledWith('wallet.card_payout', { wallet_id: 'wallet-1' });
      expect(result.amount).toBe('30.00');
    });

    it('allows the payout when no cooperative restriction is passed (platform/finance staff)', async () => {
      const em = {
        findOne: jest.fn().mockResolvedValue(walletWithCoop(null, '12.00')),
        update: jest.fn().mockResolvedValue(undefined),
        save: jest.fn().mockResolvedValue(undefined),
        create: jest.fn((_e: any, o: any) => o),
      };
      dataSource.transaction.mockImplementation(async (cb) => cb(em));

      const result = await service.payoutCardBalance('wallet-1');

      expect(result.message).toBeDefined();
      expect(gateway.notifyCoop).not.toHaveBeenCalled();
    });
  });
});
