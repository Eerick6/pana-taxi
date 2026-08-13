import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserStatus } from '../../users/entities/user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload: {
    sub: string;
    role: string;
    cooperative_id?: string | null;
    session_id?: string | null;
  }) {
    const user = await this.usersRepository.findOne({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException();
    }
    // Sesión única por cuenta — user.session_id null significa que esta
    // cuenta nunca inició sesión desde que existe el campo (migración), no
    // se fuerza el chequeo hasta su próximo login. A partir de ahí, un
    // token con session_id distinto (login desde otro dispositivo lo
    // reemplazó) queda invalidado de inmediato.
    if (user.session_id && payload.session_id !== user.session_id) {
      throw new UnauthorizedException('Sesión cerrada desde otro dispositivo');
    }
    // Inyectar cooperative_id desde el payload para que controllers de coop lo usen sin query params
    user.cooperative_id = payload.cooperative_id ?? null;
    return user;
  }
}
