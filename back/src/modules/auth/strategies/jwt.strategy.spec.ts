import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtStrategy } from './jwt.strategy';
import { User, UserStatus, UserRole } from '../../users/entities/user.entity';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let usersRepo: { findOne: jest.Mock };

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn() };
    process.env.JWT_SECRET = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      providers: [JwtStrategy, { provide: getRepositoryToken(User), useValue: usersRepo }],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => jest.clearAllMocks());

  it('throws UnauthorizedException when the user no longer exists', async () => {
    usersRepo.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'u1', role: UserRole.CLIENT, session_id: 's1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the user is not ACTIVE', async () => {
    usersRepo.findOne.mockResolvedValue({ id: 'u1', status: UserStatus.SUSPENDED, session_id: 's1' });

    await expect(
      strategy.validate({ sub: 'u1', role: UserRole.CLIENT, session_id: 's1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token whose session_id no longer matches the user (logged in elsewhere)', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: 'u1',
      status: UserStatus.ACTIVE,
      session_id: 'current-device-session',
    });

    await expect(
      strategy.validate({ sub: 'u1', role: UserRole.CLIENT, session_id: 'stale-device-session' }),
    ).rejects.toThrow('Sesión cerrada desde otro dispositivo');
  });

  it('accepts a token whose session_id matches the user current session', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE, session_id: 'current-device-session' };
    usersRepo.findOne.mockResolvedValue(user);

    const result = await strategy.validate({
      sub: 'u1',
      role: UserRole.CLIENT,
      session_id: 'current-device-session',
    });

    expect(result).toBe(user);
  });

  it('does not enforce the check for pre-migration accounts with no session_id yet', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE, session_id: null };
    usersRepo.findOne.mockResolvedValue(user);

    // Token has no session_id at all (issued before the feature existed) and
    // the user record hasn't logged in since — must NOT be force-logged-out.
    const result = await strategy.validate({ sub: 'u1', role: UserRole.CLIENT, session_id: undefined });

    expect(result).toBe(user);
  });

  it('injects cooperative_id from the payload onto the returned user', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE, session_id: 's1' };
    usersRepo.findOne.mockResolvedValue(user);

    const result = await strategy.validate({
      sub: 'u1',
      role: UserRole.COOPERATIVE_ADMIN,
      session_id: 's1',
      cooperative_id: 'coop-1',
    });

    expect(result.cooperative_id).toBe('coop-1');
  });

  it('sets cooperative_id to null when the payload does not carry one', async () => {
    const user = { id: 'u1', status: UserStatus.ACTIVE, session_id: 's1' };
    usersRepo.findOne.mockResolvedValue(user);

    const result = await strategy.validate({ sub: 'u1', role: UserRole.CLIENT, session_id: 's1' });

    expect(result.cooperative_id).toBeNull();
  });
});
