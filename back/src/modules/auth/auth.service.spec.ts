import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { PlatformMember } from '../platform/entities/platform-member.entity';
import { CooperativeMember } from '../cooperatives/entities/cooperative-member.entity';
import { TermsService } from '../terms/terms.service';
import * as encryptTransformer from '../../common/transformers/encrypt.transformer';

// Prevent real HMAC calls from failing due to missing env vars
jest.mock('../../common/transformers/encrypt.transformer', () => ({
  hmacLookup: jest.fn().mockReturnValue('hashed-cedula'),
}));

// Silence console.log in dev SMS/email output
jest.spyOn(console, 'log').mockImplementation(() => undefined);

function makeRepo<T = any>() {
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn((dto: Partial<T>) => dto as T),
    createQueryBuilder: jest.fn().mockReturnValue({
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(),
    }),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let usersRepo: ReturnType<typeof makeRepo<User>>;
  let clientsRepo: ReturnType<typeof makeRepo<Client>>;
  let platformMembersRepo: ReturnType<typeof makeRepo<PlatformMember>>;
  let cooperativeMembersRepo: ReturnType<typeof makeRepo<CooperativeMember>>;
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let termsService: { validateAcceptance: jest.Mock };

  beforeEach(async () => {
    usersRepo = makeRepo<User>();
    clientsRepo = makeRepo<Client>();
    platformMembersRepo = makeRepo<PlatformMember>();
    cooperativeMembersRepo = makeRepo<CooperativeMember>();
    jwtService = { sign: jest.fn().mockReturnValue('mock-token'), verify: jest.fn() };
    termsService = { validateAcceptance: jest.fn().mockResolvedValue({ version: '1.0' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(Client), useValue: clientsRepo },
        { provide: getRepositoryToken(PlatformMember), useValue: platformMembersRepo },
        { provide: getRepositoryToken(CooperativeMember), useValue: cooperativeMembersRepo },
        { provide: JwtService, useValue: jwtService },
        { provide: TermsService, useValue: termsService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);

    // Ensure tests run in dev mode (OTP bypass available)
    process.env.NODE_ENV = 'test';
    process.env.HMAC_SECRET = 'test-secret';
  });

  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────────────────────────────────────────────────────
  // registerClient
  // ─────────────────────────────────────────────────────────────────────────────
  describe('registerClient', () => {
    const dto = {
      phone: '+593999000001',
      cedula: '1234567890',
      full_name: 'Ana Torres',
      terms_version: '1.0',
    };

    it('should throw ConflictException when phone already exists', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 'u1', phone: dto.phone });

      await expect(service.registerClient(dto as any)).rejects.toThrow(ConflictException);
      await expect(service.registerClient(dto as any)).rejects.toThrow('Teléfono ya registrado');
    });

    it('should throw ConflictException when cedula is already registered', async () => {
      // Phone not found
      usersRepo.findOne.mockResolvedValue(null);
      // Cedula query returns a match
      clientsRepo.createQueryBuilder().getOne.mockResolvedValue({ id: 'c1' });

      await expect(service.registerClient(dto as any)).rejects.toThrow(ConflictException);
      await expect(service.registerClient(dto as any)).rejects.toThrow('Cédula ya registrada');
    });

    it('should create user and client, then send OTP on success', async () => {
      usersRepo.findOne.mockResolvedValue(null);
      clientsRepo.createQueryBuilder().getOne.mockResolvedValue(null);
      // save returns a user object with an id
      const savedUser = { id: 'u-new', phone: dto.phone, role: UserRole.CLIENT } as User;
      usersRepo.save.mockResolvedValue(savedUser);
      // create must also return the savedUser so service.registerClient uses savedUser.id
      usersRepo.create.mockReturnValue(savedUser);
      clientsRepo.save.mockResolvedValue({ id: 'c-new' });
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.registerClient(dto as any);

      expect(usersRepo.save).toHaveBeenCalledTimes(1);
      expect(clientsRepo.save).toHaveBeenCalledTimes(1);
      // OTP update called with the user id from the saved user
      expect(usersRepo.update).toHaveBeenCalledWith(
        'u-new',
        expect.objectContaining({ otp_code: expect.any(String), otp_expires_at: expect.any(Date) }),
      );
      expect(result).toHaveProperty('message');
    });

    it('should return dev_code in non-production environment', async () => {
      process.env.NODE_ENV = 'development';
      usersRepo.findOne.mockResolvedValue(null);
      clientsRepo.createQueryBuilder().getOne.mockResolvedValue(null);
      usersRepo.save.mockResolvedValue({ id: 'u-new' });
      clientsRepo.save.mockResolvedValue({ id: 'c-new' });
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.registerClient(dto as any);

      expect(result).toHaveProperty('dev_code');
      expect(typeof (result as any).dev_code).toBe('string');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // verifyPhoneOtp
  // ─────────────────────────────────────────────────────────────────────────────
  describe('verifyPhoneOtp', () => {
    const dto = { phone: '+593999000001', code: '123456' };

    it('should throw UnauthorizedException when phone not found', async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(service.verifyPhoneOtp(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when OTP code is invalid', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: dto.phone,
        role: UserRole.CLIENT,
        otp_code: '999999',
        otp_expires_at: new Date(Date.now() + 60_000),
      });

      // Force production mode so the '000000' bypass is disabled
      process.env.NODE_ENV = 'production';

      await expect(service.verifyPhoneOtp({ phone: dto.phone, code: '111111' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when OTP code is expired', async () => {
      process.env.NODE_ENV = 'production';
      usersRepo.findOne.mockResolvedValue({
        id: 'u1',
        phone: dto.phone,
        role: UserRole.CLIENT,
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() - 1000), // already expired
      });

      await expect(service.verifyPhoneOtp(dto)).rejects.toThrow('Código expirado');
    });

    it('should return tokens when OTP is valid', async () => {
      process.env.NODE_ENV = 'production';
      const user = {
        id: 'u1',
        phone: dto.phone,
        role: UserRole.CLIENT,
        otp_code: '123456',
        otp_expires_at: new Date(Date.now() + 60_000),
      };
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.verifyPhoneOtp(dto);

      expect(usersRepo.update).toHaveBeenCalledWith(user.id, { otp_code: null, otp_expires_at: null });
      expect(result).toMatchObject({
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        role: UserRole.CLIENT,
      });
    });

    it('should accept bypass code 000000 in dev mode', async () => {
      process.env.NODE_ENV = 'development';
      const user = {
        id: 'u1',
        phone: dto.phone,
        role: UserRole.CLIENT,
        otp_code: '999999',
        otp_expires_at: new Date(Date.now() + 60_000),
      };
      usersRepo.findOne.mockResolvedValue(user);
      usersRepo.update.mockResolvedValue(undefined);

      const result = await service.verifyPhoneOtp({ phone: dto.phone, code: '000000' });

      expect(result).toHaveProperty('access_token');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // generateTokens (tested indirectly via verifyPhoneOtp)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('generateTokens (via verifyPhoneOtp)', () => {
    const validUser = (role: UserRole) => ({
      id: 'u1',
      phone: '+593999000002',
      role,
      otp_code: '123456',
      otp_expires_at: new Date(Date.now() + 60_000),
    });

    const dto = { phone: '+593999000002', code: '123456' };

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      usersRepo.update.mockResolvedValue(undefined);
    });

    it('should include cooperative_id in JWT payload for COOPERATIVE_ADMIN', async () => {
      const user = validUser(UserRole.COOPERATIVE_ADMIN);
      usersRepo.findOne.mockResolvedValue(user);
      cooperativeMembersRepo.findOne.mockResolvedValue({
        cooperative: { id: 'coop-123' },
      });

      await service.verifyPhoneOtp(dto);

      // jwtService.sign is called with payload — check first call (access token)
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ cooperative_id: 'coop-123' }),
      );
    });

    it('should include cooperative_id for COOPERATIVE_OPERATOR', async () => {
      const user = validUser(UserRole.COOPERATIVE_OPERATOR);
      usersRepo.findOne.mockResolvedValue(user);
      cooperativeMembersRepo.findOne.mockResolvedValue({
        cooperative: { id: 'coop-456' },
      });

      await service.verifyPhoneOtp(dto);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ cooperative_id: 'coop-456' }),
      );
    });

    it('should set cooperative_id to null for CLIENT role', async () => {
      const user = validUser(UserRole.CLIENT);
      usersRepo.findOne.mockResolvedValue(user);

      await service.verifyPhoneOtp(dto);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ cooperative_id: null }),
      );
      // cooperativeMembersRepo should NOT have been queried
      expect(cooperativeMembersRepo.findOne).not.toHaveBeenCalled();
    });

    it('should set cooperative_id to null for PLATFORM_ADMIN role', async () => {
      const user = validUser(UserRole.PLATFORM_ADMIN);
      usersRepo.findOne.mockResolvedValue(user);

      await service.verifyPhoneOtp(dto);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ cooperative_id: null }),
      );
      expect(cooperativeMembersRepo.findOne).not.toHaveBeenCalled();
    });

    it('should set cooperative_id to null when COOP member has no cooperative', async () => {
      const user = validUser(UserRole.COOPERATIVE_SUPERVISOR);
      usersRepo.findOne.mockResolvedValue(user);
      // membership exists but cooperative is missing
      cooperativeMembersRepo.findOne.mockResolvedValue({ cooperative: null });

      await service.verifyPhoneOtp(dto);

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({ cooperative_id: null }),
      );
    });
  });
});
